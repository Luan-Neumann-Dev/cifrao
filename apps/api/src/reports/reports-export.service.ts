import { Injectable } from '@nestjs/common';
import { type ReportExportQuery, formatBRL, formatInSaoPaulo, toCsv } from '@cifrao/shared';
import { ReportsService } from './reports.service';

/**
 * Exportação CSV do relatório (Fase 7). O arquivo sai com `;` e BOM, que é o que
 * o Excel em pt-BR abre sem pedir nada. Os valores vão em duas colunas: centavos
 * (para conferir a soma) e o texto em BRL (para ler).
 */
@Injectable()
export class ReportsExportService {
  constructor(private readonly reports: ReportsService) {}

  async toCsvFile(
    userId: string,
    query: ReportExportQuery,
  ): Promise<{ filename: string; content: string }> {
    const report = await this.reports.overview(userId, query);
    const inicio = formatInSaoPaulo(report.period.from, 'yyyy-MM-dd');
    const fim = formatInSaoPaulo(report.period.to, 'yyyy-MM-dd');

    switch (query.section) {
      case 'lancamentos':
        return {
          filename: `cifrao-lancamentos-${inicio}-a-${fim}.csv`,
          content: toCsv(
            ['Data', 'Descrição', 'Categoria', 'Conta', 'Centavos', 'Valor'],
            report.topTransactions.map((tx) => [
              formatInSaoPaulo(tx.date),
              tx.description,
              tx.category?.name ?? '',
              tx.account?.name ?? tx.creditCard?.nickname ?? '',
              tx.amountCents,
              formatBRL(tx.amountCents),
            ]),
          ),
        };

      case 'serie':
        return {
          filename: `cifrao-serie-${inicio}-a-${fim}.csv`,
          content: toCsv(
            ['Período', 'Entradas', 'Saídas', 'Líquido', 'Acumulado'],
            report.series.map((point) => [
              point.bucket,
              formatBRL(point.incomeCents),
              formatBRL(point.expenseCents),
              formatBRL(point.netCents),
              formatBRL(point.cumulativeCents),
            ]),
          ),
        };

      case 'estabelecimentos':
        return {
          filename: `cifrao-estabelecimentos-${inicio}-a-${fim}.csv`,
          content: toCsv(
            ['Estabelecimento', 'Lançamentos', 'Centavos', 'Total'],
            report.topMerchants.map((m) => [m.label, m.count, m.totalCents, formatBRL(m.totalCents)]),
          ),
        };

      default:
        return {
          filename: `cifrao-categorias-${inicio}-a-${fim}.csv`,
          content: toCsv(
            [
              'Categoria',
              'Centavos',
              'Total',
              'Participação (%)',
              'Lançamentos',
              'Média',
              'Período anterior',
              'Variação',
              'Variação (%)',
            ],
            report.categories.map((row) => [
              row.name,
              row.totalCents,
              formatBRL(row.totalCents),
              row.percent.toFixed(2).replace('.', ','),
              row.count,
              formatBRL(row.averageCents),
              formatBRL(row.previousCents),
              formatBRL(row.deltaCents),
              row.percentChange === null ? '' : row.percentChange.toFixed(2).replace('.', ','),
            ]),
          ),
        };
    }
  }
}
