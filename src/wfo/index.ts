require('custom-env').env()

import { PrismaClient } from '@prisma/client'
import * as wfo from './ingest'
import { logStats } from './support'
import { prismaOptions } from '../common/utils'

const prisma = new PrismaClient(prismaOptions)

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
