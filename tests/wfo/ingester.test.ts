import {
  closeDatabaseConnection,
  createDbSnapshot,
  createIngest,
  resetDatabase,
  byId,
} from '../support'

import fixtures from '../fixtures/wfo'
import { fetchAndIngest } from '../../dist/wfo/ingest'
import uuidGenerator from '../fixtures/uuids'

const currentIngestId = `3d7ce295-0fc3-4c35-ab71-f70ffd221f92`
const previousIngestId = `beffa460-b7c3-45c6-81f2-be6b3087025b`
const oldIngestId = `6164f51e-cd6a-485b-915a-32034ac3e113`

let dbSnapshot: {
  flora_taxa: any[]
  flora_taxa_names: any[]
  flora_names: any[]
}
describe('wfo', () => {
  describe('with no existing data', () => {
    describe('and some new records', () => {
      beforeEach(async () => {
        await resetDatabase()
        await createIngest(currentIngestId, 'wfo')
        await fetchAndIngest(
          currentIngestId,
          './tests/fixtures/wfo/classification-n3.txt',
          {
            uuids: uuidGenerator(),
          },
        )
        dbSnapshot = await createDbSnapshot()
      })

      test('creates flora_taxa', () => {
        expect(dbSnapshot.flora_taxa.length).toBe(2)
        expect(dbSnapshot.flora_taxa.sort(byId)).toMatchObject(
          fixtures.n3.flora_taxa.sort(byId),
        )
      })

      test('creates flora_names', () => {
        expect(dbSnapshot.flora_names.length).toBe(3)
        expect(dbSnapshot.flora_names.sort(byId)).toMatchObject(
          fixtures.n3.flora_names.sort(byId),
        )
      })

      test('creates flora_taxa_names', () => {
        expect(dbSnapshot.flora_taxa_names.length).toBe(3)
        expect(dbSnapshot.flora_taxa_names.sort(byId)).toMatchObject(
          fixtures.n3.flora_taxa_names.sort(byId),
        )
      })

      afterAll(closeDatabaseConnection)
    })

    describe('with a record that is a synonym of itself', () => {
      beforeEach(async () => {
        await resetDatabase()
        await createIngest(currentIngestId, 'wfo')
        await fetchAndIngest(
          currentIngestId,
          './tests/fixtures/wfo/classification-self-synonym.txt',
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
        await createIngest(currentIngestId, 'wfo')
        await fetchAndIngest(
          currentIngestId,
          './tests/fixtures/wfo/classification-recursive-synonym.txt',
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
        expect(dbSnapshot.flora_names.sort(byId)).toMatchObject(
          fixtures.recursiveSynonym.flora_names.sort(byId),
        )
      })

      test('creates flora_taxa_names', () => {
        expect(dbSnapshot.flora_taxa_names.length).toBe(3)
        expect(dbSnapshot.flora_taxa_names.sort(byId)).toMatchObject(
          fixtures.recursiveSynonym.flora_taxa_names.sort(byId),
        )
      })

      afterAll(closeDatabaseConnection)
    })

    describe("with records that are composed of families and genera, or are synonyms of these, or are names that don't parse", () => {
      beforeEach(async () => {
        await resetDatabase()
        await createIngest(currentIngestId, 'wfo')
        await fetchAndIngest(
          currentIngestId,
          './tests/fixtures/wfo/classification-irrelevant.txt',
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

      await createIngest(previousIngestId, 'wfo', true)

      await fetchAndIngest(
        previousIngestId,
        './tests/fixtures/wfo/classification-n3.txt',
        {
          uuids,
        },
      )
    })

    describe('and some new records', () => {
      beforeEach(async () => {
        await createIngest(currentIngestId, 'wfo')
        await fetchAndIngest(
          currentIngestId,
          './tests/fixtures/wfo/classification-n3+4.txt',
          {
            uuids,
          },
        )
        dbSnapshot = await createDbSnapshot()
      })

      test('creates additional flora_taxa', () => {
        expect(dbSnapshot.flora_taxa.length).toBe(4)
        expect(dbSnapshot.flora_taxa.sort(byId)).toMatchObject(
          fixtures.n7.flora_taxa.sort(byId),
        )
      })

      test('creates additional flora_names', () => {
        expect(dbSnapshot.flora_names.length).toBe(6)
        expect(dbSnapshot.flora_names.sort(byId)).toMatchObject(
          fixtures.n7.flora_names.sort(byId),
        )
      })

      test('creates additional flora_taxa_names', () => {
        expect(dbSnapshot.flora_taxa_names.length).toBe(9)
        expect(dbSnapshot.flora_taxa_names.sort(byId)).toMatchObject(
          fixtures.n7.flora_taxa_names.sort(byId),
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

      await createIngest(oldIngestId, 'wfo', false)

      await fetchAndIngest(
        oldIngestId,
        './tests/fixtures/wfo/classification-n1.txt',
        {
          uuids,
        },
      )

      await createIngest(previousIngestId, 'wfo', true)

      await fetchAndIngest(
        previousIngestId,
        './tests/fixtures/wfo/classification-n3.txt',
        {
          uuids,
        },
      )
    })

    describe('and some new records', () => {
      beforeEach(async () => {
        await createIngest(currentIngestId, 'wfo')
        await fetchAndIngest(
          currentIngestId,
          './tests/fixtures/wfo/classification-n3+4.txt',
          {
            uuids,
          },
        )
        dbSnapshot = await createDbSnapshot()
      })

      test('ignores old flora_taxa', () => {
        expect(dbSnapshot.flora_taxa.length).toBe(5)
        expect(dbSnapshot.flora_taxa.sort(byId)).toMatchObject(
          fixtures.n8.flora_taxa.sort(byId),
        )
      })

      afterAll(closeDatabaseConnection)
    })
  })
})
