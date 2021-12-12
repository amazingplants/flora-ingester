import Prisma from '@prisma/client'
const { PrismaClient } = Prisma
import { prismaOptions } from '../src/common/utils'
const prisma = new PrismaClient(prismaOptions)

export async function createIngest(
  ingestId: string,
  type: string,
  active?: boolean,
) {
  active = !!active
  await prisma.flora_ingests.create({
    data: {
      id: ingestId,
      type: type === 'wfo' ? 'wfo' : 'powo',
      created_at: new Date(),
      active,
    },
  })
}

export async function createDbSnapshot() {
  return {
    flora_taxa: await prisma.flora_taxa.findMany(),
    flora_taxa_names: await prisma.flora_taxa_names.findMany(),
    flora_names: await prisma.flora_names.findMany(),
  }
}

export async function resetDatabase() {
  await prisma.$executeRaw('TRUNCATE TABLE flora_ingests CASCADE;')
  await prisma.$executeRaw('TRUNCATE TABLE powo_raw_data CASCADE;')
  await prisma.$executeRaw('TRUNCATE TABLE wfo_raw_data CASCADE;')
  await prisma.$executeRaw('TRUNCATE TABLE flora_taxa_names CASCADE;')
  await prisma.$executeRaw('TRUNCATE TABLE flora_taxa CASCADE;')
  await prisma.$executeRaw('TRUNCATE TABLE flora_names CASCADE;')
}

export async function closeDatabaseConnection() {
  await prisma.$disconnect()
}
