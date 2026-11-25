export type SecureCredentialStore = {
  store(key: string, secret: string): Promise<boolean>
  load(key: string): Promise<string | null>
  delete(key: string): Promise<void>
}
