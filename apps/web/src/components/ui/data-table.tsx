import { useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
} from 'lucide-react'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type OnChangeFn,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { Button } from './button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from './dropdown-menu'

type DataTableColumnMeta = {
  align?: 'left' | 'center' | 'right'
}

function columnAlignment(meta: unknown): DataTableColumnMeta['align'] {
  return (meta as DataTableColumnMeta | undefined)?.align
}

function columnLabel<TData>(column: Column<TData, unknown>): string {
  const header = column.columnDef.header
  return typeof header === 'string' ? header : column.id
}

interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[]
  data: TData[]
  emptyMessage?: string
  manualSorting?: boolean
  sorting?: SortingState
  onSortingChange?: OnChangeFn<SortingState>
  columnVisibility?: VisibilityState
  onColumnVisibilityChange?: OnChangeFn<VisibilityState>
  showColumnVisibility?: boolean
}

export function DataTable<TData>({
  columns,
  data,
  emptyMessage = 'No records',
  manualSorting = false,
  sorting,
  onSortingChange,
  columnVisibility,
  onColumnVisibilityChange,
  showColumnVisibility = true,
}: DataTableProps<TData>) {
  const [internalSorting, setInternalSorting] = useState<SortingState>([])
  const [internalColumnVisibility, setInternalColumnVisibility] =
    useState<VisibilityState>({})

  const activeSorting = sorting ?? internalSorting
  const activeColumnVisibility =
    columnVisibility ?? internalColumnVisibility

  const table = useReactTable({
    columns,
    data,
    state: {
      sorting: activeSorting,
      columnVisibility: activeColumnVisibility,
    },
    onSortingChange: onSortingChange ?? setInternalSorting,
    onColumnVisibilityChange:
      onColumnVisibilityChange ?? setInternalColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualSorting,
    sortDescFirst: false,
  })

  const hideableColumns = table
    .getAllLeafColumns()
    .filter((column) => column.getCanHide())

  return (
    <div className="data-table-shell">
      {showColumnVisibility && hideableColumns.length > 0 ? (
        <div className="data-table-tools">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label="Columns"
                className="data-table-columns-trigger"
                size="sm"
                variant="outline"
              >
                Columns
                <ChevronDown aria-hidden="true" size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                {hideableColumns.map((column) => (
                  <DropdownMenuCheckboxItem
                    checked={column.getIsVisible()}
                    key={column.id}
                    onCheckedChange={(checked) =>
                      column.toggleVisibility(Boolean(checked))
                    }
                    onSelect={(event) => event.preventDefault()}
                  >
                    {columnLabel(column)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const label = columnLabel(header.column)
                  const renderedHeader = header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )
                  const sortingDirection = header.column.getIsSorted()
                  const align =
                    columnAlignment(header.column.columnDef.meta) ?? 'left'

                  return (
                    <th
                      data-align={align}
                      key={header.id}
                      scope="col"
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <Button
                          aria-label={`Sort by ${label}`}
                          className="data-table-sort-button"
                          data-align={align}
                          data-sorted={sortingDirection ? 'true' : undefined}
                          onClick={header.column.getToggleSortingHandler()}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <span>{renderedHeader}</span>
                          {sortingDirection === 'asc' ? (
                            <ArrowUp
                              aria-hidden="true"
                              className="data-table-sort-icon"
                              size={12}
                            />
                          ) : sortingDirection === 'desc' ? (
                            <ArrowDown
                              aria-hidden="true"
                              className="data-table-sort-icon"
                              size={12}
                            />
                          ) : (
                            <ArrowUpDown
                              aria-hidden="true"
                              className="data-table-sort-icon"
                              size={12}
                            />
                          )}
                        </Button>
                      ) : (
                        renderedHeader
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>

          <tbody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td
                      data-align={
                        columnAlignment(cell.column.columnDef.meta) ?? 'left'
                      }
                      key={cell.id}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  className="data-table-empty"
                  colSpan={table.getVisibleLeafColumns().length || 1}
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
