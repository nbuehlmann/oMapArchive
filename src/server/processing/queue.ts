import { Queue } from 'bullmq'
import { env } from '@/env'

export type MapProcessingJobData = {
  mapId: string
  originalFileUrl: string
  originalFormat: 'jpeg' | 'png' | 'pdf' | 'geotiff' | 'ocad' | 'oom'
}

type RedisConnectionOptions = {
  host: string
  port: number
  username?: string
  password?: string
  maxRetriesPerRequest: null
}

const parseRedisUrl = (url: string): RedisConnectionOptions => {
  const parsed = new URL(url)
  return {
    host: parsed.hostname,
    port: parsed.port ? parseInt(parsed.port, 10) : 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    maxRetriesPerRequest: null,
  }
}

export const getRedisOptions = (): RedisConnectionOptions => parseRedisUrl(env.REDIS_URL)

export const mapProcessingQueue = new Queue<MapProcessingJobData, void, string>('map-processing', {
  connection: getRedisOptions(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
})
