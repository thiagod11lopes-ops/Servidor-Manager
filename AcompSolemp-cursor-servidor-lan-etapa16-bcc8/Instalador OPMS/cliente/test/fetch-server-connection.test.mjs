import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveStartUrlFromServer } from '../lib/fetch-server-connection.mjs'
import { classifyFetchError } from '../lib/classify-fetch-error.mjs'
import {
  isAcceptableFixedLanLoginResponse,
  locationMatchesFixedLanContract,
} from '../lib/probe-fixed-lan-http.mjs'

const fixedLanUrls = {
  host: '192.168.1.100',
  port: 8080,
  loginUrl: 'http://192.168.1.100:8080/login',
  baseUrl: 'http://192.168.1.100:8080',
  origin: 'http://192.168.1.100:8080',
}

test('classifyFetchError traduz abort como timeout de rede', () => {
  const msg = classifyFetchError(new Error('This operation was aborted'))
  assert.match(msg, /Tempo esgotado/)
  assert.match(msg, /8080/)
})

test('login aceita redirect no mesmo host/porta', () => {
  assert.equal(
    isAcceptableFixedLanLoginResponse(
      { status: 302, location: 'http://192.168.1.100:8080/login/' },
      { host: '192.168.1.100', port: 8080 },
    ),
    true,
  )
  assert.equal(
    locationMatchesFixedLanContract('http://10.0.0.1:8080/x', { host: '192.168.1.100', port: 8080 }),
    false,
  )
})

test('resolveStartUrlFromServer marca indisponível quando json e login falham', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async (url) => {
    if (String(url).includes('server-connection.json')) {
      throw new Error('This operation was aborted')
    }
    if (String(url).includes('/login')) {
      throw new Error('ECONNREFUSED')
    }
    throw new Error('unexpected')
  }
  try {
    const result = await resolveStartUrlFromServer(fixedLanUrls.origin, fixedLanUrls.loginUrl, 100, fixedLanUrls)
    assert.equal(result.serverUnreachable, true)
    assert.equal(result.startUrl, fixedLanUrls.loginUrl)
    assert.match(result.detail, /Descoberta:/)
    assert.match(result.detail, /\/login:/)
    assert.doesNotMatch(result.detail, /This operation was aborted/)
  } finally {
    globalThis.fetch = original
  }
})

test('resolveStartUrlFromServer permanece ativo com login quando json falha', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async (url) => {
    if (String(url).includes('server-connection.json')) {
      return { ok: false, status: 503, json: async () => ({}) }
    }
    if (String(url).includes('/login')) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
      }
    }
    throw new Error('unexpected')
  }
  try {
    const result = await resolveStartUrlFromServer(fixedLanUrls.origin, fixedLanUrls.loginUrl, 5000, fixedLanUrls)
    assert.notEqual(result.serverUnreachable, true)
    assert.equal(result.startUrl, fixedLanUrls.loginUrl)
    assert.match(result.detail, /\/login/)
  } finally {
    globalThis.fetch = original
  }
})

test('resolveStartUrlFromServer usa json válido sem fallback de URL', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async (url) => {
    if (String(url).includes('server-connection.json')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          client: { recommendedStartUrl: 'http://192.168.1.100:8080/login' },
        }),
      }
    }
    throw new Error('unexpected')
  }
  try {
    const result = await resolveStartUrlFromServer(fixedLanUrls.origin, fixedLanUrls.loginUrl, 5000, fixedLanUrls)
    assert.equal(result.startUrl, fixedLanUrls.loginUrl)
    assert.equal(result.source, 'server-connection.json')
  } finally {
    globalThis.fetch = original
  }
})
