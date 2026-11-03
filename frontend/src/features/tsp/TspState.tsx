import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { useLocation } from 'react-router'
import { parseTspParams, type TspLearnerParams } from './params.ts'

type TspState = readonly [TspLearnerParams, Dispatch<SetStateAction<TspLearnerParams>>]

const Context = createContext<TspState | null>(null)

/** Keep launch hints and edits in memory while the learner switches webview sections. */
export function TspStateProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const state = useState(() => parseTspParams(location.search))
  return <Context.Provider value={state}>{children}</Context.Provider>
}

export function useTspState(): TspState {
  const state = useContext(Context)
  if (!state) throw new Error('TSP webview state is unavailable')
  return state
}
