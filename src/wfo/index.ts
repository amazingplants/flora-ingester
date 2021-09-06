require('custom-env').env()

import fs from 'fs'
import { PrismaClient } from '@prisma/client'
import * as wfo from './ingest'
import { logStats } from './support'

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

;(async () => {
  const ingest = await prisma.flora_ingests.findFirst({
    where: {
      type: 'wfo',
    },
    orderBy: {
      created_at: 'desc',
    },
  })

  const results = await wfo.ingest(ingest.id)
  await logStats(ingest.id, results)
  process.exit()
})()
