export const register = async (): Promise<void> => {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startWorker } = await import('./server/processing/worker')
    startWorker()
  }
}
