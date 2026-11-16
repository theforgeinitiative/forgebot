import { defineConfig } from 'vitest/config'

// The bot runs with TZ=America/New_York (see src/index.ts); tests pin the same
// zone so time formatting and igloohome windows match production.
process.env.TZ = 'America/New_York'

export default defineConfig({
  test: {
    environment: 'node',
    env: { TZ: 'America/New_York' },
    include: ['src/**/*.test.ts'],
  },
})
