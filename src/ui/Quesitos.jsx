import { ORIGEM_QUESITO } from '../schema.js';
import { RecordList } from './RecordList.jsx';
import { salvar } from './fields.jsx';

const CAMPOS = [
  ['origem', 'Origem', 'select', ORIGEM_QUESITO],
  ['numero', 'Número', 'text'],
  ['texto', 'Texto literal do quesito', 'area'],
  ['resposta', 'Anotações / resposta (em campo ou no escritório)', 'area'],
];

export function Quesitos({ rec }) {
  return (
    <div class="grade">
      <section class="bloco largo">
        <p class="dica">Os quesitos entram automaticamente quando você extrai os dados dos autos na etapa <b>2. Autos</b>. Aqui você confere, corrige ou acrescenta. A anotação de cada quesito pode ser feita durante a vistoria e sai no Registro da diligência.</p>
        <label class="check"><input type="checkbox" checked={!!rec.data.semQuesitos} onChange={(e) => salvar(rec.id, 'semQuesitos', e.currentTarget.checked)} /> Este caso não tem quesitos</label>
      </section>
      <div class="largo">
        <RecordList kind="quesito" caseId={rec.id} campos={CAMPOS} novo="Adicionar quesito" inicial={{ origem: 'Juízo' }}
          resumo={(r) => {
            const t = (r.data.texto || '').replace(/\s+/g, ' ');
            const ok = (r.data.resposta || '').trim() ? ' ✓' : '';
            return `${r.data.origem || ''} ${r.data.numero ? `– ${r.data.numero})` : ''} ${t.slice(0, 110)}${t.length > 110 ? '…' : ''}${ok}`;
          }} />
      </div>
    </div>
  );
}
