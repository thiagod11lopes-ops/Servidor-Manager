import fs from 'node:fs/promises'
import path from 'node:path'
import { monitoringFile } from './paths.ts'
import type { HistorySample, MonitoringHistory } from './types.ts'

const MAX_SAMPLES = 24 * 60
const MAX_HOURLY = 7 * 24
const MAX_DAILY = 30

function emptyHistory(): MonitoringHistory {
  return { version: 1, samples: [], hourly: [], daily: [] }
}

export async function loadMonitoringHistory(): Promise<MonitoringHistory> {
  try {
    const raw = await fs.readFile(monitoringFile('history.json'), 'utf8')
    const parsed = JSON.parse(raw) as MonitoringHistory
    if (parsed.version === 1 && Array.isArray(parsed.samples)) {
      return parsed
    }
  } catch {
    // ignore
  }
  return emptyHistory()
}

async function persist(history: MonitoringHistory): Promise<void> {
  await fs.mkdir(path.dirname(monitoringFile('history.json')), { recursive: true })
  await fs.writeFile(monitoringFile('history.json'), JSON.stringify(history, null, 2), 'utf8')
}

function aggregateBucket(samples: HistorySample[]): HistorySample {
  const pick = (key: keyof HistorySample) => {
    const values = samples.map((s) => s[key]).filter((v): v is number => typeof v === 'number')
    if (!values.length) return null
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
  }
  return {
    t: samples[samples.length - 1]?.t ?? new Date().toISOString(),
    cpu: pick('cpu'),
    mem: pick('mem'),
    netIn: pick('netIn'),
    netOut: pick('netOut'),
    diskUsedPercent: pick('diskUsedPercent'),
    diskPath: samples[samples.length - 1]?.diskPath ?? null,
  }
}

export async function appendHistorySample(sample: HistorySample): Promise<void> {
  const history = await loadMonitoringHistory()
  history.samples.push(sample)
  if (history.samples.length > MAX_SAMPLES) {
    const overflow = history.samples.splice(0, history.samples.length - MAX_HOURLY)
    if (overflow.length) {
      history.hourly.push(aggregateBucket(overflow))
      if (history.hourly.length > MAX_HOURLY) {
        const dailyOverflow = history.hourly.splice(0, history.hourly.length - MAX_DAILY)
        if (dailyOverflow.length) {
          history.daily.push(aggregateBucket(dailyOverflow))
          if (history.daily.length > MAX_DAILY) {
            history.daily = history.daily.slice(-MAX_DAILY)
          }
        }
      }
    }
  }
  await persist(history)
}

export function filterHistory(history: MonitoringHistory, range: '24h' | '7d' | '30d'): HistorySample[] {
  const now = Date.now()
  const cutoff =
    range === '24h' ? now - 24 * 3600_000 : range === '7d' ? now - 7 * 24 * 3600_000 : now - 30 * 24 * 3600_000
  const fromSamples = history.samples.filter((s) => Date.parse(s.t) >= cutoff)
  if (range === '24h') return fromSamples
  const hourly = history.hourly.filter((s) => Date.parse(s.t) >= cutoff)
  if (range === '7d') return [...hourly, ...fromSamples]
  return [...history.daily.filter((s) => Date.parse(s.t) >= cutoff), ...hourly, ...fromSamples]
}
