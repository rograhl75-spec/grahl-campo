import { describe, it, expect } from 'vitest';
import { ehVinculoMotorista, vinculosMotorista } from '../src/docx/penosidade.js';
import { RE_MOTORISTA } from '../src/basesUsuario.js';

// Dados sintéticos.
const v = (data) => ({ data });
describe('vínculo de motorista avaliado vínculo a vínculo', () => {
  it('indústria e serraria não são de motorista; o caminhão é', () => {
    const calcados = v({ empresa: 'Fábrica de calçados', cargo: 'Montador', atividades: 'Lixamento de sola e colagem' });
    const serraria = v({ empresa: 'Fábrica de móveis', cargo: 'Operador de máquina', atividades: 'Seccionadora e esquadrejadeira' });
    const entregador = v({ empresa: 'Atacadista', cargo: 'Entregador', atividades: 'Carga, descarga e entregas viajando no caminhão' });
    const motorista = v({ empresa: 'Atacadista', cargo: 'Motorista', atividades: 'Direção do caminhão' });
    expect(ehVinculoMotorista(calcados)).toBe(false);
    expect(ehVinculoMotorista(serraria)).toBe(false);
    expect(ehVinculoMotorista(entregador)).toBe(true);
    expect(ehVinculoMotorista(motorista)).toBe(true);
    expect(vinculosMotorista({ periodos: [calcados, serraria, entregador, motorista] }).length).toBe(2);
  });
  it('"operador de máquina" de indústria não aciona a base de veículos; máquina móvel pesada aciona', () => {
    expect(RE_MOTORISTA.test('Operador de máquina')).toBe(false);
    expect(RE_MOTORISTA.test('Operador de pá carregadeira')).toBe(true);
    expect(RE_MOTORISTA.test('Tratorista')).toBe(true);
  });
});
