import { useState } from 'preact/hooks';
import { gerarPreRelatorio, gerarRegistroDiligencia, gerarRelatorioFotografico } from '../docx/reports.js';
import { exportarBackup, baixarArquivo, carimbo } from '../backup.js';
import { gravarTudoAgora } from './fields.jsx';

const DOCS = [
  ['pre', 'Pré-relatório de análise processual e pericial', 'Identificação, síntese da inicial e da defesa, documentos, EPIs, quesitos na íntegra e planejamento da diligência. Com capa e sumário.', gerarPreRelatorio],
  ['reg', 'Registro da diligência', 'Data, local, presentes, equipamentos com calibração, postos avaliados, medições, anotações dos quesitos.', gerarRegistroDiligencia],
  ['foto', 'Relatório fotográfico', 'Duas fotos por página, numeradas, com legenda, posto, data/hora e GPS.', gerarRelatorioFotografico],
];

export function Documentos({ rec }) {
  const [ocupado, setOcupado] = useState('');
  const [msg, setMsg] = useState('');
  const gerar = async (k, fn) => {
    gravarTudoAgora();
    setOcupado(k); setMsg('');
    try {
      const r = await fn(rec.id);
      baixarArquivo(r.blob, r.nome);
      setMsg(`✓ ${r.nome} gerado.${r.faltando ? ` Atenção: ${r.faltando} foto(s) ainda não baixadas neste aparelho ficaram de fora.` : ''}`);
    } catch (e) {
      console.error(e);
      setMsg('Erro ao gerar: ' + e.message);
    } finally { setOcupado(''); }
  };
  const backupCaso = async () => {
    setOcupado('zip');
    try {
      const r = await exportarBackup({ caseId: rec.id });
      baixarArquivo(r.blob, `Caso_${(rec.data.numero || rec.data.autorNome || rec.id).replace(/[^\w.-]+/g, '_')}_${carimbo()}.zip`);
      setMsg(`✓ Cópia do caso exportada (${r.total} registros, ${r.fotos} fotos).`);
    } catch (e) { setMsg('Erro: ' + e.message); } finally { setOcupado(''); }
  };
  return (
    <div class="grade">
      {DOCS.map(([k, titulo, desc, fn]) => (
        <section class="bloco doc">
          <h3>{titulo}</h3>
          <p>{desc}</p>
          <button type="button" class="primario" disabled={!!ocupado} onClick={() => gerar(k, fn)}>{ocupado === k ? 'Gerando…' : 'Gerar Word (timbrado)'}</button>
        </section>
      ))}
      <section class="bloco doc">
        <h3>Cópia completa do caso</h3>
        <p>ZIP com todos os dados e fotos originais deste caso. Pode ser guardado no Drive ou no PC e restaurado a qualquer momento.</p>
        <button type="button" disabled={!!ocupado} onClick={backupCaso}>{ocupado === 'zip' ? 'Gerando…' : 'Exportar caso (ZIP)'}</button>
      </section>
      {msg && <p class="ok-msg largo">{msg}</p>}
    </div>
  );
}
