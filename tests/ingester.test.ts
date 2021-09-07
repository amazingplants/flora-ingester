import {
  closeDatabaseConnection,
  createDbSnapshot,
  createIngest,
  currentIngestId,
  previousIngestId,
  oldIngestId,
  resetDatabase,
} from './support'

import fixtures from './fixtures/index'
import { fetchAndIngest } from '../dist/wfo/ingest'
import uuidGenerator from './fixtures/uuids'

let dbSnapshot: {
  flora_taxa: any[]
  flora_taxa_names: any[]
  flora_names: any[]
}

describe('with no existing data', () => {
  describe('and some new records', () => {
    beforeEach(async () => {
      await resetDatabase()
      await createIngest(currentIngestId)
      await fetchAndIngest(
        currentIngestId,
        './tests/fixtures/classification-n3.txt',
        {
          uuids: uuidGenerator(),
        },
      )
      dbSnapshot = await createDbSnapshot()
    })

    test('creates flora_taxa', () => {
      expect(dbSnapshot.flora_taxa.length).toBe(2)
      expect(dbSnapshot.flora_taxa).toMatchObject(fixtures.n3.flora_taxa)
    })

    test('creates flora_names', () => {
      expect(dbSnapshot.flora_names.length).toBe(3)
      expect(dbSnapshot.flora_names).toMatchObject(fixtures.n3.flora_names)
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
      await createIngest(currentIngestId)
      await fetchAndIngest(
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
      expect(dbSnapshot.flora_taxa).toMatchObject(
        fixtures.selfSynonym.flora_taxa,
      )
    })

    test('creates flora_names', () => {
      expect(dbSnapshot.flora_names.length).toBe(1)
      expect(dbSnapshot.flora_names).toMatchObject(
        fixtures.selfSynonym.flora_names,
      )
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
      await createIngest(currentIngestId)
      await fetchAndIngest(
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

    test('creates flora_names', () => {
      expect(dbSnapshot.flora_names.length).toBe(3)
      expect(dbSnapshot.flora_names).toMatchObject(
        fixtures.recursiveSynonym.flora_names,
      )
    })

    test('creates flora_taxa_names', () => {
      expect(dbSnapshot.flora_taxa_names.length).toBe(3)
      expect(dbSnapshot.flora_taxa_names).toMatchObject(
        fixtures.recursiveSynonym.flora_taxa_names,
      )
    })

    afterAll(closeDatabaseConnection)
  })

  describe('with records that are composed of families and genera, or are synonyms of these', () => {
    beforeEach(async () => {
      await resetDatabase()
      await createIngest(currentIngestId)
      await fetchAndIngest(
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

    test('does not create flora_names', () => {
      expect(dbSnapshot.flora_names.length).toBe(0)
    })

    test('does not create flora_taxa_names', () => {
      expect(dbSnapshot.flora_taxa_names.length).toBe(0)
    })

    afterAll(closeDatabaseConnection)
  })
})

describe('with existing data', () => {
  let uuids

  beforeEach(async () => {
    await resetDatabase()
    uuids = uuidGenerator()

    await createIngest(previousIngestId, true)

    await fetchAndIngest(
      previousIngestId,
      './tests/fixtures/classification-n3.txt',
      {
        uuids,
      },
    )
  })

  describe('and some new records', () => {
    beforeEach(async () => {
      await createIngest(currentIngestId)
      await fetchAndIngest(
        currentIngestId,
        './tests/fixtures/classification-n3+4.txt',
        {
          uuids,
        },
      )
      dbSnapshot = await createDbSnapshot()
    })

    test('creates additional flora_taxa', () => {
      expect(dbSnapshot.flora_taxa.length).toBe(4)
      expect(dbSnapshot.flora_taxa).toMatchObject(fixtures.n7.flora_taxa)
    })

    test('creates additional flora_names', () => {
      expect(dbSnapshot.flora_names.length).toBe(6)
      expect(dbSnapshot.flora_names).toMatchObject(fixtures.n7.flora_names)
    })

    test('creates additional flora_taxa_names', () => {
      expect(dbSnapshot.flora_taxa_names.length).toBe(9)
      expect(dbSnapshot.flora_taxa_names).toMatchObject(
        fixtures.n7.flora_taxa_names,
      )
    })

    test('does not duplicate existing flora_names', () => {
      expect(
        dbSnapshot.flora_names.filter(
          (n) => n.scientific_name === 'Cirsium spinosissimum',
        ).length,
      ).toBe(1)
    })

    afterAll(closeDatabaseConnection)
  })
})

describe('with old data', () => {
  let uuids

  beforeEach(async () => {
    await resetDatabase()
    uuids = uuidGenerator()

    await createIngest(oldIngestId, false)

    await fetchAndIngest(
      oldIngestId,
      './tests/fixtures/classification-n1.txt',
      {
        uuids,
      },
    )

    await createIngest(previousIngestId, true)

    await fetchAndIngest(
      previousIngestId,
      './tests/fixtures/classification-n3.txt',
      {
        uuids,
      },
    )
  })

  describe('and some new records', () => {
    beforeEach(async () => {
      await createIngest(currentIngestId)
      await fetchAndIngest(
        currentIngestId,
        './tests/fixtures/classification-n3+4.txt',
        {
          uuids,
        },
      )
      dbSnapshot = await createDbSnapshot()
    })

    test('ignores old flora_taxa', () => {
      expect(dbSnapshot.flora_taxa.length).toBe(5)
      expect(dbSnapshot.flora_taxa).toMatchObject(fixtures.n8.flora_taxa)
    })

    afterAll(closeDatabaseConnection)
  })
})
