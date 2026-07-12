import { Box, DoorOpen, Plus, Warehouse } from 'lucide-react'
import type { ShopItemKind } from '../../types'
import { SHOP_ITEM_KINDS } from '../../domain/shopObjects'

export function ObjectIcon({ kind }: { kind: ShopItemKind }) { return kind === 'door' ? <DoorOpen/> : kind === 'storage' ? <Warehouse/> : <Box/> }
export function TextField({ label, value, onChange }: { label: string, value: string, onChange: (value: string) => void }) { return <label className="field"><span>{label}</span><input value={value} onChange={event => onChange(event.target.value)}/></label> }
export function KindField({ value, onChange }: { value: ShopItemKind, onChange: (value: ShopItemKind) => void }) { return <label className="field"><span>Category</span><select value={value} onChange={event => onChange(event.target.value as ShopItemKind)}>{SHOP_ITEM_KINDS.map(kind => <option value={kind.value} key={kind.value}>{kind.label}</option>)}</select></label> }
export function ColorField({ value, onChange }: { value: string, onChange: (value: string) => void }) { return <label className="field color-field"><span>Color</span><input type="color" value={value} onChange={event => onChange(event.target.value)}/></label> }
export function Empty({ title, action }: { title: string, action: () => void }) { return <div className="empty-page"><h2>{title}</h2><button className="button" onClick={action}><Plus/>Create one</button></div> }
