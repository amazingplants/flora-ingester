import {
  closeDatabaseConnection,
  createDbSnapshot,
  currentIngestId,
  resetDatabase,
} from './support'

import fixtures from './fixtures/index'
import { ingest } from '../dist/ingester'
import uuidGenerator from './fixtures/uuids'

let dbSnapshot: { flora_taxa: any[]; flora_taxa_names: any[]; names: any[] }

describe('with no existing data', () => {
  beforeEach(async () => {
    await resetDatabase()
    await ingest(currentIngestId, './tests/fixtures/classification-n3.txt', {
      uuids: uuidGenerator(),
    })
    dbSnapshot = await createDbSnapshot()
  })

  test('creates flora_taxa', () => {
    expect(dbSnapshot.flora_taxa.length).toBe(2)
    expect(dbSnapshot.flora_taxa).toMatchObject(fixtures.n3.flora_taxa)
  })

  test('creates names', () => {
    expect(dbSnapshot.names.length).toBe(3)
    expect(dbSnapshot.names).toMatchObject(fixtures.n3.names)
  })

  test('creates flora_taxa_names', () => {
    expect(dbSnapshot.flora_taxa_names.length).toBe(3)
    expect(dbSnapshot.flora_taxa_names).toMatchObject(
      fixtures.n3.flora_taxa_names,
    )
  })

  afterAll(closeDatabaseConnection)
})

describe('with a record that is a synonym of itself', () => {
  beforeEach(async () => {
    await resetDatabase()
    await ingest(
      currentIngestId,
      './tests/fixtures/classification-self-synonym.txt',
      {
        uuids: uuidGenerator(),
      },
    )
    dbSnapshot = await createDbSnapshot()
  })

  test('creates flora_taxa', () => {
    expect(dbSnapshot.flora_taxa.length).toBe(1)
    expect(dbSnapshot.flora_taxa).toMatchObject(fixtures.selfSynonym.flora_taxa)
  })

  test('creates names', () => {
    expect(dbSnapshot.names.length).toBe(1)
    expect(dbSnapshot.names).toMatchObject(fixtures.selfSynonym.names)
  })

  test('creates flora_taxa_names', () => {
    expect(dbSnapshot.flora_taxa_names.length).toBe(1)
    expect(dbSnapshot.flora_taxa_names).toMatchObject(
      fixtures.selfSynonym.flora_taxa_names,
    )
  })

  afterAll(closeDatabaseConnection)
})

describe('with a record that is a synonym of another synonym', () => {
  beforeEach(async () => {
    await resetDatabase()
    await ingest(
      currentIngestId,
      './tests/fixtures/classification-recursive-synonym.txt',
      {
        uuids: uuidGenerator(),
      },
    )
    dbSnapshot = await createDbSnapshot()
  })

  test('creates flora_taxa', () => {
    expect(dbSnapshot.flora_taxa.length).toBe(1)
    expect(dbSnapshot.flora_taxa).toMatchObject(
      fixtures.recursiveSynonym.flora_taxa,
    )
  })

  test('creates names', () => {
    expect(dbSnapshot.names.length).toBe(3)
    expect(dbSnapshot.names).toMatchObject(fixtures.recursiveSynonym.names)
  })

  test('creates flora_taxa_names', () => {
    expect(dbSnapshot.flora_taxa_names.length).toBe(3)
    expect(dbSnapshot.flora_taxa_names).toMatchObject(
      fixtures.recursiveSynonym.flora_taxa_names,
    )
  })

  afterAll(closeDatabaseConnection)
})

describe('with records that are composed of families and genera', () => {
  beforeEach(async () => {
    await resetDatabase()
    await ingest(
      currentIngestId,
      './tests/fixtures/classification-irrelevant.txt',
      {
        uuids: uuidGenerator(),
      },
    )
    dbSnapshot = await createDbSnapshot()
  })

  test('does not create flora_taxa', () => {
    expect(dbSnapshot.flora_taxa.length).toBe(0)
  })

  test('does not create names', () => {
    expect(dbSnapshot.names.length).toBe(0)
  })

  test('does not create flora_taxa_names', () => {
    expect(dbSnapshot.flora_taxa_names.length).toBe(0)
  })

  afterAll(closeDatabaseConnection)
})
