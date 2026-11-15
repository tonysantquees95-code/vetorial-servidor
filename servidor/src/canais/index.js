import { ErroCanal } from "./comum.js";
import { nuvemshop } from "./nuvemshop.js";
import { mercadolivre } from "./mercadolivre.js";
import { proprio } from "./proprio.js";

export const CONECTORES = { nuvemshop, mercadolivre, proprio };

export function conector(plataforma) {
  const c = CONECTORES[plataforma];
  if (!c) throw new ErroCanal("plataforma_desconhecida", "Plataforma não suportada. Use nuvemshop, mercadolivre ou proprio.", 400);
  return c;
}
export { ErroCanal };
