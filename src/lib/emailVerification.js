// Verificación de correo por código (OTP) para cuentas de correo/contraseña.
//
// El registro con correo/contraseña hace que Base44 mande un código de 6 dígitos
// al correo; mientras no se verifique, el login responde con un mensaje de
// "verify your email". La pantalla que recibe el código es
// `components/VerifyEmailStep.jsx`; este archivo es la lógica pura (sin React)
// para que se pueda razonar y probar aparte.

/** True si el error del login/registro significa "correo sin verificar". */
export const needsEmailVerification = (error) =>
  /verify your email|verification code|email (is )?not verified|not verified/i.test(error?.message || '');

/** Sólo 6 dígitos cuentan como código completo. */
export const isCompleteOtp = (code) => /^\d{6}$/.test(String(code || '').trim());

/** Mensajes de la plataforma (en inglés) -> español claro. Lo demás se conserva. */
export function friendlyAuthMessage(error, fallback) {
  const raw = String(error?.message || '');
  if (/expired/i.test(raw)) return 'El código venció. Pide uno nuevo con "Reenviar código".';
  if (/invalid|incorrect|wrong|not match/i.test(raw) && /code|otp/i.test(raw)) {
    return 'El código no es correcto. Revísalo e inténtalo de nuevo.';
  }
  if (/too many|rate limit|429/i.test(raw) || error?.status === 429 || error?.response?.status === 429) {
    return 'Demasiados intentos. Espera un momento y vuelve a intentarlo.';
  }
  if (/already (exists|registered)|in use/i.test(raw)) {
    return 'Ya existe una cuenta con ese correo. Inicia sesión.';
  }
  return raw || fallback;
}
