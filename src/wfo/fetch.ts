require('custom-env').env()
import { PrismaClient } from '@prisma/client'
import { logDeep } from '../common/utils'
import { fetchRawData } from './ingest'
import { prismaOptions } from '../common/utils'

const prisma = new PrismaClient(prismaOptions)

;(async () => {
  const ingest = await prisma.flora_ingests.create({
    data: {
      type: 'wfo',
      created_at: new Date(),
    },
  })

  await fetchRawData(ingest.id, './local-data/classification.txt')

  process.exit()
})()
