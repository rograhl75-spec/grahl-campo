import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { agenteParaDados, anexosDoAgente, filtrarAgentes, importarBaseQuimicos, idDoAgente, GRUPOS_QUIMICOS } from '../src/quimicos.js';
import { db } from '../src/db.js';

const base = JSON.parse(readFileSync(new URL('../public/bases/quimicos-base.json', import.meta.url), 'utf8'));
const porId = Object.fromEntries(base.agentes.map((a) => [a.id, a]));

describe('base de químicos: decretos e anexos da NR-15', () => {
  it('ids únicos e todo agente classificado pelos anexos', () => {
    expect(new Set(base.agentes.map((a) => a.id)).size).toBe(base.agentes.length);
    for (const a of base.agentes) {
      expect(Array.isArray(a.nr15.anexos), a.id).toBe(true);
      a.nr15.anexos.forEach((x) => expect(['11', '12', '13', '13-A']).toContain(x));
      if (a.nr15.anexo11) expect(a.nr15.anexos, a.id).toContain('11');
      expect(a.codDecretos, a.id).toMatch(/Dec\. 3\.048\/1999: /);
      a.grupos.forEach((g) => expect(GRUPOS_QUIMICOS, a.id).toContain(g));
    }
  });
  it('agentes dos decretos incluídos com o código do Anexo IV', () => {
    const casos = { arsenio: '1.0.1', berilio: '1.0.4', bromo: '1.0.5', 'carvao-mineral': '1.0.7', cloro: '1.0.9', 'dissulfeto-de-carbono': '1.0.11',
      'fosforo-branco': '1.0.12', iodo: '1.0.13', 'manganes-poeira': '1.0.14', 'niquel-carbonila': '1.0.16', 'silica-livre': '1.0.18', estireno: '1.0.19' };
    for (const [id, cod] of Object.entries(casos)) expect(porId[id].codDecretos, id).toContain(`Dec. 3.048/1999: ${cod}`);
  });
  it('classificação por anexo de agentes conhecidos', () => {
    expect(porId.chumbo.nr15.anexos).toEqual(['11', '13']);
    expect(porId['silica-livre'].nr15.anexos).toEqual(['12']);
    expect(porId.amianto.nr15.anexos).toContain('12');
    expect(porId.benzeno.nr15.anexos).toEqual(['13-A']);
    expect(porId.arsenio.nr15.anexos).toEqual(['13']);
    expect(porId.cloro.nr15.anexo11).toMatchObject({ ppm: '0,8', grau: 'máximo' });
    expect(porId['oxido-nitroso'].nr15.anexos).toEqual(['11']);
    expect(porId['4-aminodifenil'].nr15.observacao).toMatch(/proibida qualquer exposição/);
  });
  it('ficha do app recebe os anexos e o filtro funciona', () => {
    const d = agenteParaDados(porId.chumbo);
    expect(d.nr15Anexos).toBe('Anexo 11; Anexo 13');
    expect(anexosDoAgente(d)).toEqual(['11', '13']);
    expect(agenteParaDados(porId.pcb).nr15Anexos).toMatch(/^Nenhum/);
    const lista = ['chumbo', 'silica-livre', 'pcb', 'benzeno'].map((id) => ({ id, data: agenteParaDados(porId[id]) }));
    expect(filtrarAgentes(lista, '', '', '12').map((r) => r.id)).toEqual(['silica-livre']);
    expect(filtrarAgentes(lista, '', '', '13-A').map((r) => r.id)).toEqual(['benzeno']);
    expect(filtrarAgentes(lista, '', '', 'nenhum').map((r) => r.id)).toEqual(['pcb']);
  });
  it('importa a base inteira no banco do app', async () => {
    const r = await importarBaseQuimicos(base);
    expect(r.falhas).toEqual([]);
    expect(r.lidos).toBe(base.agentes.length);
    const rec = await db.records.get(idDoAgente(porId['silica-livre']));
    expect(rec.data.nr15Anexos).toBe('Anexo 12');
    expect(rec.data.nr15Obs).toMatch(/8 \/ \(% quartzo \+ 2\)/);
  });
});
