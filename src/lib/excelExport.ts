import ExcelJS from 'exceljs'

const VERSA_BLUE = 'FF0074BD'
const VERSA_NAVY = 'FF162860'
const WHITE = 'FFFFFFFF'
const OFF_WHITE = 'FFF7F7F7'

export interface ExcelColumn {
  header: string
  key: string
  width?: number
}

export function styleWorksheetHeader(worksheet: any, columns: ExcelColumn[]) {
  worksheet.columns = columns.map(c => ({ header: c.header, key: c.key, width: c.width || 20 }))
  const headerRow = worksheet.getRow(1)
  headerRow.eachCell((cell: any) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERSA_NAVY } }
    cell.font = { color: { argb: WHITE }, bold: true, size: 11 }
    cell.alignment = { vertical: 'middle', horizontal: 'left' }
  })
  headerRow.height = 22
}

export function addBandedRows(worksheet: any, rows: Record<string, any>[]) {
  rows.forEach((rowData, idx) => {
    const row = worksheet.addRow(rowData)
    if (idx % 2 === 1) {
      row.eachCell((cell: any) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: OFF_WHITE } }
      })
    }
    row.eachCell((cell: any) => {
      cell.font = { size: 10.5, color: { argb: 'FF1A1A1A' } }
      cell.alignment = { vertical: 'middle' }
    })
  })
}

export function addSheetTitle(worksheet: any, title: string, columnSpan: number) {
  worksheet.insertRow(1, [title])
  worksheet.mergeCells(1, 1, 1, columnSpan)
  const titleCell = worksheet.getCell(1, 1)
  titleCell.font = { size: 14, bold: true, color: { argb: VERSA_NAVY } }
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' }
  worksheet.getRow(1).height = 28
}

export async function workbookToResponse(workbook: ExcelJS.Workbook, filename: string): Promise<Response> {
  const buffer = await workbook.xlsx.writeBuffer()
  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
