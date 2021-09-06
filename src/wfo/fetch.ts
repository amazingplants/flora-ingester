require('custom-env').env()
import { PrismaClient } from '@prisma/client'
import { logDeep } from '../common/utils'
import { fetchRawData } from './ingest'

const prisma = new PrismaClient(
  process.env.DEBUG
    ? {
        log: [
          {
            emit: 'event',
            level: 'query',
          },
          {
            emit: 'stdout',
            level: 'error',
          },
          {
            emit: 'stdout',
            level: 'warn',
          },
        ],
      }
    : undefined,
)

if (process.env.DEBUG) {
  prisma.$on('query', (e) => {
    console.log('Query: ')
    logDeep(e.query)
    console.log('Params: ' + e.params)
    console.log('Duration: ' + e.duration + 'ms')
  })
}

;(async () => {
  await prisma.$executeRaw(`TRUNCATE TABLE app.wfo_raw_data;`)

  const ingest = await prisma.flora_ingests.create({
    data: {
      type: 'wfo',
      created_at: new Date(),
    },
  })

  await fetchRawData(ingest.id, './local-data/classification.txt')

  process.exit()
})()
