import util from 'util'

export function logDeep(obj: any) {
  console.log(util.inspect(obj, { showHidden: false, depth: null }))
}

export const prismaOptions = {
  __internal: {
    useUds: true,
  },
} as any

if (process.env.DEBUG) {
  prismaOptions.log = [
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
  ]
}
