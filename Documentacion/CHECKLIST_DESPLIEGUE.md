# ✅ Checklist de Despliegue en Vercel

Usa este checklist para asegurarte de completar todos los pasos necesarios para desplegar FlowHook en Vercel.

## 📋 Pre-despliegue

- [ ] Proyecto funciona correctamente en local (`npm run build` exitoso)
- [ ] Proyecto subido a GitHub (recomendado)
- [ ] `.gitignore` configurado correctamente (no subir `.env.local`)
- [ ] Cuenta de Vercel creada

## 💾 Vercel KV

- [ ] Base de datos KV creada en Vercel
- [ ] Credenciales de KV copiadas:
  - [ ] `KV_REST_API_URL`
  - [ ] `KV_REST_API_TOKEN`

## 🔐 NextAuth

- [ ] `NEXTAUTH_SECRET` generado (32 bytes, base64)
- [ ] `NEXTAUTH_URL` preparado (será la URL de Vercel después del despliegue)

## 🔗 Proveedores OAuth (Opcional - al menos uno recomendado)

### GitHub OAuth
- [ ] OAuth App creada en GitHub
- [ ] Client ID obtenido
- [ ] Client Secret obtenido
- [ ] Callback URL configurada (se actualizará después del despliegue)

### Google OAuth
- [ ] Proyecto creado en Google Cloud Console
- [ ] Google+ API habilitada
- [ ] OAuth 2.0 Client ID creado
- [ ] Client ID obtenido
- [ ] Client Secret obtenido
- [ ] Redirect URI configurada (se actualizará después del despliegue)

### Email (Magic Link)
- [ ] Servidor SMTP configurado
- [ ] Credenciales SMTP obtenidas
- [ ] Contraseña de aplicación generada (si usas Gmail)

## 🚀 Despliegue

- [ ] Proyecto desplegado en Vercel (primera vez)
- [ ] URL de Vercel obtenida (ej: `https://tu-app.vercel.app`)

## ⚙️ Variables de Entorno

### Requeridas
- [ ] `NEXTAUTH_SECRET` configurada en Vercel
- [ ] `NEXTAUTH_URL` configurada en Vercel (con la URL real)
- [ ] `KV_REST_API_URL` configurada en Vercel
- [ ] `KV_REST_API_TOKEN` configurada en Vercel

### Opcionales (si los configuraste)
- [ ] `GITHUB_ID` configurada en Vercel
- [ ] `GITHUB_SECRET` configurada en Vercel
- [ ] `GOOGLE_CLIENT_ID` configurada en Vercel
- [ ] `GOOGLE_CLIENT_SECRET` configurada en Vercel
- [ ] `SMTP_HOST` configurada en Vercel
- [ ] `SMTP_PORT` configurada en Vercel
- [ ] `SMTP_USER` configurada en Vercel
- [ ] `SMTP_PASSWORD` configurada en Vercel
- [ ] `SMTP_FROM` configurada en Vercel
- [ ] `SECRET_KEY` configurada en Vercel (para proteger webhooks)

## 🔄 Actualización de URLs

- [ ] `NEXTAUTH_URL` actualizada con la URL real de Vercel
- [ ] GitHub OAuth callback URL actualizada
- [ ] Google OAuth redirect URI actualizada

## 🔄 Redespliegue

- [ ] Aplicación redesplegada después de configurar variables de entorno

## ✅ Verificación

- [ ] Aplicación carga correctamente en el navegador
- [ ] Página de login accesible
- [ ] Autenticación funciona (probar con al menos un proveedor)
- [ ] Dashboard accesible después de login
- [ ] Crear flujo funciona correctamente
- [ ] Flujo se guarda y persiste (verificar en Vercel KV)
- [ ] Webhook endpoint funciona (probar con curl o Postman)
- [ ] Logs de Vercel no muestran errores críticos

## 🎉 Completado

- [ ] Aplicación funcionando correctamente en producción
- [ ] Dominio personalizado configurado (opcional)
- [ ] Monitoreo configurado (opcional)

---

## 📝 Notas

- **Importante**: El sistema de archivos local (`/tmp/data.json`) NO funciona en Vercel. Debes configurar Vercel KV para producción.
- **Plan Gratuito**: Las funciones serverless tienen un límite de 10 segundos. Si necesitas más tiempo, considera un plan de pago.
- **Cold Start**: La primera solicitud después de inactividad puede tardar más. Esto es normal en funciones serverless.

---

## 🆘 Si algo falla

1. Revisa los logs en Vercel Dashboard > Deployments > View Function Logs
2. Verifica que todas las variables de entorno estén configuradas correctamente
3. Asegúrate de que las URLs de callback coincidan exactamente
4. Consulta la sección "Solución de Problemas" en `GUIA_DESPLIEGUE_VERCEL.md`

