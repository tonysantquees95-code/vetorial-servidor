// Tempo limite para falar com serviços de fora (GitHub, IA, e-mail, Steam…).
// Vale até a resposta COMEÇAR: depois disso o relógio é desligado, para não cortar download nem texto da IA em partes.
export async function comPrazo(url, opcoes = {}, ms = 15000, buscar = fetch) {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), ms);
  try {
    return await buscar(url, { ...opcoes, signal: controle.signal });
  } finally {
    clearTimeout(relogio);
  }
}
