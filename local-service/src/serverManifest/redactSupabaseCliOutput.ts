const JSON_SECRET_KEYS = [
  'SECRET_KEY',
  'JWT_SECRET',
  'SERVICE_ROLE_KEY',
  'ANON_KEY',
  'S3_PROTOCOL_ACCESS_KEY_SECRET',
  'S3_PROTOCOL_ACCESS_KEY_ID',
] as const

/** Remove chaves sensíveis da saída do Supabase CLI antes de log/UI. */
export function redactSupabaseCliOutput(output: string): string {
  let text = output
  text = text.replace(/\bsb_secret_[A-Za-z0-9_-]+\b/g, 'sb_secret_[REDACTED]')
  text = text.replace(/(│\s*Secret\s*│\s*)([^\s│]+)/g, '$1[REDACTED]')
  text = text.replace(/(Secret Key\s*│\s*)([^\s│]+)/g, '$1[REDACTED]')
  text = text.replace(/(Access Key\s*│\s*)([^\s│]+)/g, '$1[REDACTED]')
  for (const key of JSON_SECRET_KEYS) {
    text = text.replace(new RegExp(`("${key}"\\s*:\\s*")([^"]*)(")`, 'g'), '$1[REDACTED]$3')
  }
  return text
}
