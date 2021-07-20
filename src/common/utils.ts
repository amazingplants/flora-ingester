import util from 'util'

export function logDeep(obj: any) {
  console.log(util.inspect(obj, { showHidden: false, depth: null }))
}
