/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { LengthUnit } from '../domain/lengthUnits'

interface UnitSystemValue {
  lengthUnit: LengthUnit
  toggleLengthUnit: () => void
}

const UnitSystemContext = createContext<UnitSystemValue | null>(null)

export function UnitSystemProvider({ children, lengthUnit, toggleLengthUnit }: UnitSystemValue & { children: ReactNode }) {
  return <UnitSystemContext.Provider value={{ lengthUnit, toggleLengthUnit }}>{children}</UnitSystemContext.Provider>
}

export function useUnitSystem(): UnitSystemValue {
  const value = useContext(UnitSystemContext)
  if (!value) throw new Error('useUnitSystem must be used within UnitSystemProvider')
  return value
}
