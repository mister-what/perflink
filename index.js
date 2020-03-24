import { h, render } from 'https://cdn.pika.dev/preact@10.3.3'
import {
  useReducer,
  useState,
  useEffect,
} from 'https://cdn.pika.dev/preact@10.3.3/hooks'

import htm from 'https://cdn.pika.dev/htm@3.0.3'
import css from 'https://cdn.pika.dev/csz@1.2.0'
import uid from 'https://cdn.pika.dev/uid'

const html = htm.bind(h)

import Tests from '../../components/tests.js'
import Suites from '../../components/suites.js'
import Results from '../../components/results.js'

const median = xs => xs.sort()[Math.ceil(xs.length / 2)]
const mean = arr => arr.reduce((p, c) => p + c, 0) / arr.length

const defaults = {
  started: false,
  dialog: true,
  aside: 'results',
  suites: Object.entries(localStorage).map(([k, v]) => [k, JSON.parse(v)]),
  runs: 100,
  duration: 3,
  progress: 0,
  id: uid(),
  title: 'Finding numbers in an array',
  before: `const data = [...Array(800).keys()]`,
  tests: [
    { name: 'Find item 2000', code: 'data.find(x => x == 200)', ops: 0 },
    { name: 'Find item 4000', code: 'data.find(x => x == 400)', ops: 0 },
    { name: 'Find item 8000', code: 'data.find(x => x == 800)', ops: 0 },
  ],
}

const init = location.hash
  ? {
      ...defaults,
      dialog: false,
      before: atob(location.hash.slice(1).split('/')[0]),
      tests: JSON.parse(atob(location.hash.slice(1).split('/')[1])),
      title: atob(location.hash.slice(1).split('/')[2] || ''),
      id: atob(location.hash.slice(1).split('/')[3] || uid()),
    }
  : defaults

const reducer = (state, update) => ({
  ...state,
  ...(typeof update === 'function' ? update(state) : update),
})

const pReduce = (iterable, reducer, initialValue) =>
  new Promise((resolve, reject) => {
    const iterator = iterable[Symbol.iterator]()
    let index = 0

    const next = async total => {
      const element = iterator.next()

      if (element.done) {
        resolve(total)
        return
      }

      try {
        const value = await Promise.all([total, element.value])
        next(reducer(value[0], value[1], index++))
      } catch (error) {
        reject(error)
      }
    }

    next(initialValue)
  })

const pSeries = async tasks => {
  const results = []

  await pReduce(tasks, async (_, task) => {
    const value = await task()
    results.push(value)
  })

  return results
}

function average(arr) {
  var sums = {},
    counts = {},
    results = [],
    ids = {},
    name
  for (var i = 0; i < arr.length; i++) {
    name = arr[i].code
    if (!(name in sums)) {
      sums[name] = 0
      counts[name] = 0
      ids[name] = arr[i].name
    }
    sums[name] += arr[i].ops
    counts[name]++
  }

  for (name in sums) {
    results.push({
      name: ids[name],
      code: name,
      ops: (sums[name] / counts[name]) << 0,
    })
  }
  return results
}

const app = () => {
  const [state, dispatch] = useReducer(reducer, init)
  const {
    before,
    started,
    tests,
    dialog,
    runs,
    duration,
    title,
    id,
    suites,
  } = state

  useEffect(() => {
    if (started) {
      const tasks = () => () => {
        const run = pSeries(
          tests.map(test => () =>
            new Promise((resolve, reject) => {
              const worker = new Worker('/run.js')
              worker.onmessage = e => {
                resolve(e.data)
                worker.terminate()
              }
              worker.postMessage([before, test, duration])
            })
          )
        )
        dispatch(state => ({ progress: state.progress + tests.length }))
        return run
      }
      pSeries(Array.from({ length: runs }, tasks)).then(results => {
        dispatch({ tests: average(results.flat()), started: false })
      })
    }
  }, [started, tests])

  useEffect(() => {
    history.replaceState(
      null,
      null,
      `#${btoa(before)}/${btoa(JSON.stringify(tests))}/${btoa(title)}/${btoa(
        id
      )}`
    )
    if (Object.fromEntries(suites)[id]) {
      localStorage.setItem(
        id,
        JSON.stringify({
          title,
          before,
          tests,
          updated: new Date(),
        })
      )
      dispatch({
        suites: Object.entries(localStorage).map(([k, v]) => [
          k,
          JSON.parse(v),
        ]),
      })
    }
  }, [id, title, before, tests])

  useEffect(() => {
    addEventListener(
      'keydown',
      e => {
        if (
          (navigator.platform.match('Mac') ? e.metaKey : e.ctrlKey) &&
          e.keyCode == 13
        ) {
          e.preventDefault()
          dispatch(state => ({
            tests: state.tests.map(test => ({ ...test, ops: 0 })),
            started: true,
            progress: 0,
          }))
        }
      },
      false
    )
  }, [])

  return html`
    <main className="app">
      <${Tests} state=${state} dispatch=${dispatch} />
      ${state.aside === 'results'
        ? html`
            <${Results} state=${state} dispatch=${dispatch} />
          `
        : html`
            <${Suites} state=${state} dispatch=${dispatch} />
          `}
      ${dialog &&
        html`
          <dialog open>
            <h1><i>Perflink</i></h1>
            <h3>Live Javascript Benchmarking</h3>
            <p>
              Write scripts and race them. See results graphed out as you type.
              Share your findings via URL.
            </p>
            <button
              onClick=${_ => {
                dispatch({ dialog: false, started: true })
              }}
            >
              Start Experimenting
            </button>
          </dialog>
        `}
    </main>
  `
}

render(
  html`
    <${app} />
  `,
  document.body
)
