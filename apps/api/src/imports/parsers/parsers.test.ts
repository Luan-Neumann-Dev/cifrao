import { formatInSaoPaulo } from '@cifrao/shared';
import { describe, expect, it } from 'vitest';
import { inspectCsv, parseCsvWithMapping } from './csv.parser';
import { decodeUpload } from './encoding';
import { detectFormat, parseImport } from './index';
import { parseOfx } from './ofx.parser';
import { ImportParseError } from './types';

const OFX = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
CHARSET:1252

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>001<ACCTID>12345-6<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260310120000[-3:BRT]<TRNAMT>-45.90<FITID>FIT-1<MEMO>UBER *TRIP</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260311120000[-3:BRT]<TRNAMT>2500.00<FITID>FIT-2<MEMO>SALARIO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260312120000[-3:BRT]<TRNAMT>0.00<FITID>FIT-3<MEMO>ESTORNO NULO</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const CSV = ['Data;Histórico;Valor', '05/03/2026;UBER *TRIP;-45,90', '07/03/2026;SALARIO;2500,00'].join(
  '\n',
);

describe('detecção de formato (regra 5.12)', () => {
  it('reconhece pelo conteúdo, não pela extensão', () => {
    expect(detectFormat(OFX, 'arquivo.txt')).toBe('OFX');
    expect(detectFormat('!Type:Bank\nD01/02/2026\nT-10.00\n^', 'export.dat')).toBe('QIF');
    expect(detectFormat(CSV, 'extrato.xyz')).toBe('CSV');
  });

  it('cai para a extensão quando o conteúdo não denuncia', () => {
    expect(detectFormat('conteudo qualquer sem pistas', 'extrato.ofx')).toBe('OFX');
    expect(detectFormat('conteudo qualquer sem pistas', 'extrato.qif')).toBe('QIF');
  });

  it('desiste quando não dá para saber', () => {
    expect(detectFormat('linha solta sem separador', 'sem-extensao')).toBeNull();
  });
});

describe('parser OFX', () => {
  it('extrai lançamentos, conta e FITID', async () => {
    const result = await parseOfx(OFX);

    expect(result.accountLabel).toBe('12345-6');
    // A linha de valor zero é descartada: não há o que importar.
    expect(result.transactions).toHaveLength(2);

    const [despesa, receita] = result.transactions;
    expect(despesa.type).toBe('EXPENSE');
    expect(despesa.amountCents).toBe(4590n); // positivo; o sinal vive no type
    expect(despesa.description).toBe('UBER *TRIP');
    expect(despesa.externalId).toBe('FIT-1');
    expect(formatInSaoPaulo(despesa.date)).toBe('10/03/2026');

    expect(receita.type).toBe('INCOME');
    expect(receita.amountCents).toBe(250000n);
  });

  it('recusa arquivo sem extrato com mensagem clara', async () => {
    await expect(parseOfx('<OFX><SIGNONMSGSRSV1></SIGNONMSGSRSV1></OFX>')).rejects.toThrow(
      ImportParseError,
    );
  });

  it('lê extrato de cartão de crédito (outro ramo do OFX)', async () => {
    const cartao = `OFXHEADER:100
<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS>
<CCACCTFROM><ACCTID>4444</CCACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260310120000[-3:BRT]<TRNAMT>-99.90<FITID>C1<MEMO>NETFLIX</STMTTRN>
</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;
    const result = await parseOfx(cartao);
    expect(result.accountLabel).toBe('4444');
    expect(result.transactions[0].description).toBe('NETFLIX');
  });
});

describe('parser CSV', () => {
  it('inspeciona colunas e devolve prévia de no máximo 5 linhas', () => {
    const muitas = ['Data;Histórico;Valor']
      .concat(Array.from({ length: 9 }, (_, i) => `0${i + 1}/03/2026;COMPRA ${i};-10,00`))
      .join('\n');
    const inspection = inspectCsv(muitas);

    expect(inspection.headers).toEqual(['Data', 'Histórico', 'Valor']);
    expect(inspection.rowCount).toBe(9);
    expect(inspection.preview).toHaveLength(5);
    expect(inspection.suggestion.date).toBe('Data');
    expect(inspection.suggestion.description).toBe('Histórico');
    expect(inspection.suggestion.amount).toBe('Valor');
  });

  it('converte com o mapeamento, tratando decimal brasileiro', () => {
    const result = parseCsvWithMapping(CSV, {
      date: 'Data',
      description: 'Histórico',
      amount: 'Valor',
      dateFormat: 'dd/MM/yyyy',
      invertSign: false,
    });

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].amountCents).toBe(4590n);
    expect(result.transactions[0].type).toBe('EXPENSE');
    expect(result.transactions[1].amountCents).toBe(250000n);
    expect(result.transactions[1].type).toBe('INCOME');
  });

  it('inverte o sinal para extratos que exportam gasto como positivo', () => {
    const result = parseCsvWithMapping(CSV, {
      date: 'Data',
      description: 'Histórico',
      amount: 'Valor',
      dateFormat: 'dd/MM/yyyy',
      invertSign: true,
    });
    expect(result.transactions[0].type).toBe('INCOME');
    expect(result.transactions[1].type).toBe('EXPENSE');
  });

  it('aceita par débito/crédito em vez de coluna única', () => {
    const csv = ['Data;Desc;Debito;Credito', '05/03/2026;COMPRA;45,90;', '07/03/2026;DEPOSITO;;100,00'].join(
      '\n',
    );
    const result = parseCsvWithMapping(csv, {
      date: 'Data',
      description: 'Desc',
      debit: 'Debito',
      credit: 'Credito',
      dateFormat: 'dd/MM/yyyy',
      invertSign: false,
    });
    expect(result.transactions[0].type).toBe('EXPENSE');
    expect(result.transactions[0].amountCents).toBe(4590n);
    expect(result.transactions[1].type).toBe('INCOME');
    expect(result.transactions[1].amountCents).toBe(10000n);
  });

  it('avisa quando a coluna mapeada não existe', () => {
    expect(() =>
      parseCsvWithMapping(CSV, {
        date: 'DataErrada',
        description: 'Histórico',
        amount: 'Valor',
        dateFormat: 'dd/MM/yyyy',
        invertSign: false,
      }),
    ).toThrow(/Coluna não encontrada/);
  });
});

describe('parser QIF', () => {
  it('lê lançamentos e adivinha o formato da data', async () => {
    const qif = ['!Type:Bank', 'D15/03/2026', 'T-45,90', 'PUBER TRIP', '^', 'D16/03/2026', 'T2500.00', 'PSALARIO', '^'].join(
      '\n',
    );
    const result = await parseImport('QIF', qif);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].type).toBe('EXPENSE');
    expect(formatInSaoPaulo(result.transactions[0].date)).toBe('15/03/2026');
    expect(result.transactions[1].type).toBe('INCOME');
  });
});

describe('charset do upload', () => {
  it('lê windows-1252 quando o OFX declara CHARSET:1252', () => {
    const bytes = Buffer.from(`OFXHEADER:100\nCHARSET:1252\n<MEMO>MERCADO SÃO JOÃO`, 'latin1');
    expect(decodeUpload(bytes.toString('base64'))).toContain('SÃO JOÃO');
  });

  it('cai para latin1 quando o arquivo sem header não é UTF-8 válido', () => {
    const bytes = Buffer.from('PADARIA SÃO JOÃO;-10,00', 'latin1');
    expect(decodeUpload(bytes.toString('base64'))).toContain('SÃO JOÃO');
  });

  it('mantém UTF-8 quando o arquivo é UTF-8', () => {
    const bytes = Buffer.from('PADARIA SÃO JOÃO;-10,00', 'utf-8');
    expect(decodeUpload(bytes.toString('base64'))).toContain('SÃO JOÃO');
  });
});

describe('CSV exige mapeamento antes de virar staging', () => {
  it('parseImport recusa CSV sem mapeamento', async () => {
    await expect(parseImport('CSV', CSV)).rejects.toThrow(/mapeamento de colunas/i);
  });
});
