import { describe, expect, it } from 'vitest';
import { formatInSaoPaulo } from './date';
import {
  countMatchingPattern,
  daysApart,
  descriptionSimilarity,
  detectDateFormat,
  findDuplicate,
  matchCategoryRule,
  normalizeDescription,
  parseOfxDate,
  parseStatementDate,
  suggestRulePattern,
} from './import-logic';

const d = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe('normalização de descrição (regra 5.12)', () => {
  it('tira acento, caixa e pontuação', () => {
    expect(normalizeDescription('Compra Cartão *UBER')).toBe('compra cartao uber');
    expect(normalizeDescription('  MERCADO   SÃO   JOÃO  ')).toBe('mercado sao joao');
  });

  it('remove ruído de banco: datas, parcelas e ids longos', () => {
    expect(normalizeDescription('POSTO SHELL 12/05')).toBe('posto shell');
    expect(normalizeDescription('NETFLIX 3/12')).toBe('netflix');
    expect(normalizeDescription('PIX ENVIADO 998877665544')).toBe('pix enviado');
    // Número curto (valor, nº de loja) é informação, não ruído: fica.
    expect(normalizeDescription('LOJA 1234')).toBe('loja 1234');
  });

  it('descrições equivalentes convergem para o mesmo texto', () => {
    expect(normalizeDescription('COMPRA CARTAO *UBER   *TRIP')).toBe(
      normalizeDescription('Compra Cartão Uber Trip'),
    );
  });
});

describe('similaridade de descrição', () => {
  it('idêntico é 1, vazio é 0', () => {
    expect(descriptionSimilarity('Uber Trip', 'uber trip')).toBe(1);
    expect(descriptionSimilarity('', '')).toBe(0);
    expect(descriptionSimilarity('Uber', '')).toBe(0);
  });

  it('mesmo estabelecimento com ruído do banco fica acima do limiar', () => {
    expect(descriptionSimilarity('UBER *TRIP 1234', 'Uber Trip')).toBeGreaterThan(0.6);
    expect(descriptionSimilarity('IFD*IFOOD', 'IFOOD')).toBeGreaterThan(0.6);
  });

  it('estabelecimentos diferentes ficam bem abaixo do limiar', () => {
    expect(descriptionSimilarity('PADARIA CENTRAL', 'CAFE EXPRESSO')).toBeLessThan(0.3);
    expect(descriptionSimilarity('Uber Trip', 'Ifood Pedido')).toBeLessThan(0.3);
  });

  it('conta dias de calendário entre duas datas', () => {
    expect(daysApart(d('2026-08-01'), d('2026-08-04'))).toBe(3);
    expect(daysApart(d('2026-08-04'), d('2026-08-01'))).toBe(3);
    expect(daysApart(d('2026-08-01'), d('2026-08-01'))).toBe(0);
  });
});

describe('datas de extrato (regra 5.2: persiste em UTC)', () => {
  it('OFX com offset explícito converte para UTC', () => {
    // 12:00 em -03 é 15:00 UTC.
    expect(parseOfxDate('20260201120000[-3:BRT]').toISOString()).toBe('2026-02-01T15:00:00.000Z');
    expect(parseOfxDate('20260201090000[0:GMT]').toISOString()).toBe('2026-02-01T09:00:00.000Z');
  });

  it('OFX sem offset é lido como hora de parede de São Paulo', () => {
    const date = parseOfxDate('20260201120000');
    expect(formatInSaoPaulo(date, 'dd/MM/yyyy HH:mm')).toBe('01/02/2026 12:00');
  });

  it('OFX só com a data cai no meio-dia de São Paulo (não escorrega de dia)', () => {
    expect(formatInSaoPaulo(parseOfxDate('20260201'))).toBe('01/02/2026');
    // O caso que a regra 5.2 avisa: meia-noite viraria o dia anterior em UTC.
    expect(formatInSaoPaulo(parseOfxDate('20260228'))).toBe('28/02/2026');
  });

  it('recusa data OFX malformada', () => {
    expect(() => parseOfxDate('xx')).toThrow(/Data OFX inválida/);
  });

  it('CSV/QIF respeitam o formato informado', () => {
    expect(formatInSaoPaulo(parseStatementDate('05/03/2026', 'dd/MM/yyyy'))).toBe('05/03/2026');
    expect(formatInSaoPaulo(parseStatementDate('05/03/2026', 'MM/dd/yyyy'))).toBe('03/05/2026');
    expect(formatInSaoPaulo(parseStatementDate('2026-03-05', 'yyyy-MM-dd'))).toBe('05/03/2026');
    expect(formatInSaoPaulo(parseStatementDate('05/03/26', 'dd/MM/yyyy'))).toBe('05/03/2026');
  });

  it('recusa data de CSV inválida', () => {
    expect(() => parseStatementDate('05/13/2026', 'dd/MM/yyyy')).toThrow(/Data inválida/);
    expect(() => parseStatementDate('sem data', 'dd/MM/yyyy')).toThrow(/Data inválida/);
  });

  it('adivinha o formato pela amostra, com padrão brasileiro no empate', () => {
    expect(detectDateFormat(['01/02/2026', '15/02/2026'])).toBe('dd/MM/yyyy');
    expect(detectDateFormat(['02/15/2026', '02/28/2026'])).toBe('MM/dd/yyyy');
    expect(detectDateFormat(['2026-02-01'])).toBe('yyyy-MM-dd');
    // Ambíguo (todos ≤ 12): assume o formato do dono.
    expect(detectDateFormat(['01/02/2026', '03/04/2026'])).toBe('dd/MM/yyyy');
  });
});

describe('detecção de duplicata (regra 5.12)', () => {
  const existente = [
    {
      id: 'tx-1',
      date: d('2026-08-10'),
      amountCents: 4590n,
      description: 'UBER *TRIP HELP.UBER.COM',
      externalId: 'FIT-001',
    },
  ];
  const linha = {
    date: d('2026-08-10'),
    amountCents: 4590n,
    description: 'Uber Trip',
  };

  it('FITID igual ganha de tudo (dedupe exato)', () => {
    const match = findDuplicate({ ...linha, externalId: 'FIT-001' }, existente);
    expect(match).toEqual({ id: 'tx-1', score: 1, reason: 'exact' });
  });

  it('sem FITID, casa por valor + data na janela + descrição similar', () => {
    const match = findDuplicate(linha, existente);
    expect(match?.id).toBe('tx-1');
    expect(match?.reason).toBe('heuristic');
    expect(match?.score).toBeGreaterThan(0.6);
  });

  it('aceita diferença de até 3 dias e recusa o 4º', () => {
    expect(findDuplicate({ ...linha, date: d('2026-08-13') }, existente)).not.toBeNull();
    expect(findDuplicate({ ...linha, date: d('2026-08-07') }, existente)).not.toBeNull();
    expect(findDuplicate({ ...linha, date: d('2026-08-14') }, existente)).toBeNull();
    expect(findDuplicate({ ...linha, date: d('2026-08-06') }, existente)).toBeNull();
  });

  it('valor diferente nunca é duplicata, nem por um centavo', () => {
    expect(findDuplicate({ ...linha, amountCents: 4591n }, existente)).toBeNull();
  });

  it('mesmo valor e dia, estabelecimento diferente: não é duplicata', () => {
    const doisCafes = findDuplicate(
      { date: d('2026-08-10'), amountCents: 4590n, description: 'CAFE EXPRESSO' },
      existente,
    );
    expect(doisCafes).toBeNull();
  });

  it('escolhe o candidato de maior similaridade', () => {
    const candidatos = [
      { id: 'tx-a', date: d('2026-08-10'), amountCents: 4590n, description: 'UBER EATS PEDIDO' },
      { id: 'tx-b', date: d('2026-08-10'), amountCents: 4590n, description: 'UBER *TRIP' },
    ];
    const match = findDuplicate(linha, candidatos);
    expect(match?.id).toBe('tx-b');
  });

  it('contenção é por palavra inteira: "UBER" não casa com "UBERABA"', () => {
    const uberaba = [
      {
        id: 'tx-2',
        date: d('2026-08-10'),
        amountCents: 4590n,
        description: 'UBERABA SUPERMERCADO',
      },
    ];
    expect(
      findDuplicate({ date: d('2026-08-10'), amountCents: 4590n, description: 'UBER' }, uberaba),
    ).toBeNull();
  });

  it('FITID diferente não impede o casamento heurístico', () => {
    // Banco reexportou com outro id: cai para data + valor + descrição.
    const match = findDuplicate({ ...linha, externalId: 'FIT-999' }, existente);
    expect(match?.reason).toBe('heuristic');
  });

  it('lista vazia não inventa duplicata', () => {
    expect(findDuplicate(linha, [])).toBeNull();
  });
});

describe('motor de CategoryRule (regra 5.12)', () => {
  const regras = [
    { id: 'r-uber', pattern: 'uber', categoryId: 'transporte' },
    { id: 'r-uber-eats', pattern: 'uber eats', categoryId: 'alimentacao' },
    { id: 'r-posto', pattern: 'posto', categoryId: 'combustivel', minCents: 5000n },
    { id: 'r-inativa', pattern: 'netflix', categoryId: 'lazer', active: false },
  ];

  it('casa pelo padrão da descrição', () => {
    expect(matchCategoryRule(regras, { description: 'UBER *TRIP', amountCents: 4590n })).toEqual({
      ruleId: 'r-uber',
      categoryId: 'transporte',
    });
  });

  it('padrão mais específico (mais longo) vence', () => {
    const match = matchCategoryRule(regras, { description: 'UBER EATS PEDIDO', amountCents: 3000n });
    expect(match).toEqual({ ruleId: 'r-uber-eats', categoryId: 'alimentacao' });
  });

  it('respeita a faixa de valor', () => {
    expect(matchCategoryRule(regras, { description: 'POSTO IPIRANGA', amountCents: 9000n })).toEqual(
      { ruleId: 'r-posto', categoryId: 'combustivel' },
    );
    // Abaixo do mínimo: a regra não se aplica.
    expect(
      matchCategoryRule(regras, { description: 'POSTO IPIRANGA', amountCents: 1000n }),
    ).toBeNull();
  });

  it('ignora regra inativa', () => {
    expect(matchCategoryRule(regras, { description: 'NETFLIX.COM', amountCents: 5590n })).toBeNull();
  });

  it('empate de tamanho decide pela mais usada', () => {
    const empate = [
      { id: 'r-1', pattern: 'mercado', categoryId: 'cat-a', appliedCount: 2 },
      { id: 'r-2', pattern: 'mercado', categoryId: 'cat-b', appliedCount: 40 },
    ];
    expect(matchCategoryRule(empate, { description: 'MERCADO DIA', amountCents: 100n })?.ruleId).toBe(
      'r-2',
    );
  });

  it('sem regra que case, não sugere nada', () => {
    expect(matchCategoryRule(regras, { description: 'FARMACIA X', amountCents: 100n })).toBeNull();
  });

  it('valor negativo é comparado em módulo', () => {
    expect(
      matchCategoryRule(regras, { description: 'POSTO SHELL', amountCents: -9000n })?.categoryId,
    ).toBe('combustivel');
  });
});

describe('criação de regra a partir da revisão', () => {
  it('sugere o miolo significativo da descrição', () => {
    expect(suggestRulePattern('COMPRA CARTAO *UBER *TRIP 12/05')).toBe('compra cartao uber');
    expect(suggestRulePattern('IFD*IFOOD 998877665544')).toBe('ifd ifood');
  });

  it('conta quantas linhas do lote casariam com o padrão (o "N" do botão)', () => {
    const linhas = [
      { description: 'UBER *TRIP 1' },
      { description: 'Uber Trip 2' },
      { description: 'IFOOD PEDIDO' },
    ];
    expect(countMatchingPattern('uber', linhas)).toBe(2);
    expect(countMatchingPattern('ifood', linhas)).toBe(1);
    expect(countMatchingPattern('', linhas)).toBe(0);
  });
});
