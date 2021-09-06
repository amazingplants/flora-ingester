import Prisma from '@prisma/client'
const { PrismaClient } = Prisma
const prisma = new PrismaClient({
  log: [/*'query',*/ `warn`, `error`],
  __internal: {
    useUds: true,
  },
} as any)

export const currentIngestId = `3d7ce295-0fc3-4c35-ab71-f70ffd221f92`
export const previousIngestId = `beffa460-b7c3-45c6-81f2-be6b3087025b`

export async function createDbSnapshot() {
  return {
    flora_taxa: await prisma.flora_taxa.findMany(),
    flora_taxa_names: await prisma.flora_taxa_names.findMany(),
    flora_names: await prisma.flora_names.findMany(),
  }
}

export async function resetDatabase() {
  await prisma.$executeRaw('TRUNCATE TABLE flora_ingests CASCADE;')
  await prisma.$executeRaw('TRUNCATE TABLE wfo_raw_data CASCADE;')
  await prisma.$executeRaw('TRUNCATE TABLE flora_taxa_names CASCADE;')
  await prisma.$executeRaw('TRUNCATE TABLE flora_taxa CASCADE;')
  await prisma.$executeRaw('TRUNCATE TABLE flora_names CASCADE;')
}

export async function closeDatabaseConnection() {
  await prisma.$disconnect()
}
