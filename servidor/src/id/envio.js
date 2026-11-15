// Envio dos códigos (recuperação de senha): e-mail pela Resend e SMS pela Twilio. Sem a chave do provedor
// no Worker, o canal fica indisponível (o app avisa). `env.fetchEnvio` existe para os testes.
export const canaisDisponiveis = (env) => ({
  email: !!env.RESEND_API_KEY,
  sms: !!(env.TWILIO_SID && env.TWILIO_TOKEN && env.TWILIO_DE),
});

export async function enviarCodigo(env, canal, destino, codigo) {
  const f = env.fetchEnvio || fetch;
  const texto = `Seu código do Vetorial ID: ${codigo}. Vale por 10 minutos. Se não foi você, ignore esta mensagem.`;
  if (canal === "email") {
    const r = await f("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_REMETENTE || "Vetorial ID <onboarding@resend.dev>", to: [destino], subject: "Seu código do Vetorial ID", text: texto }),
    });
    return r.ok;
  }
  const corpo = new URLSearchParams({ To: destino, From: env.TWILIO_DE, Body: texto });
  const r = await f(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_SID}/Messages.json`, {
    method: "POST",
    headers: { authorization: `Basic ${btoa(`${env.TWILIO_SID}:${env.TWILIO_TOKEN}`)}`, "content-type": "application/x-www-form-urlencoded" },
    body: corpo,
  });
  return r.ok;
}
