import NextAuth from 'next-auth';
import GitHubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import EmailProvider from 'next-auth/providers/email';
import CredentialsProvider from 'next-auth/providers/credentials';
import Adapter from '@/lib/adapter';
import bcrypt from 'bcryptjs';

console.log('🔧 Inicializando NextAuth...');

// Construir array de proveedores dinámicamente
const providers = [];

// Credentials Provider (email/contraseña)
// Nota: El adapter se inicializa en authOptions, pero necesitamos una instancia para el CredentialsProvider
// Por eso creamos una función helper que obtiene el adapter cuando sea necesario
const getAdapter = () => Adapter();

// Solo agregar CredentialsProvider si hay usuarios con contraseña en el sistema
// Esto permite login con email + contraseña para usuarios que se registraron por email
providers.push(
  CredentialsProvider({
    name: 'Credenciales',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Contraseña', type: 'password' }
    },
    async authorize(credentials) {
      try {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const adapter = getAdapter();
        // Buscar usuario por email
        const user = await adapter.getUserByEmail(credentials.email);
        
        if (!user) {
          console.log('Usuario no encontrado:', credentials.email);
          return null;
        }

        // Verificar si el usuario tiene contraseña
        if (!user.password || !user.hasPassword) {
          console.log('Usuario no tiene contraseña establecida:', credentials.email);
          return null;
        }

        // Verificar contraseña
        const isPasswordValid = await bcrypt.compare(credentials.password, user.password);
        
        if (!isPasswordValid) {
          console.log('Contraseña incorrecta para usuario:', credentials.email);
          return null;
        }

        // Retornar usuario si la contraseña es correcta
        return {
          id: user.id,
          email: user.email,
          name: user.name || user.email.split('@')[0],
        };
      } catch (error) {
        console.error('Error en authorize:', error);
        return null;
      }
    }
  })
);

// GitHub Provider (si está configurado)
if (process.env.GITHUB_ID && process.env.GITHUB_SECRET) {
  providers.push(
    GitHubProvider({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    })
  );
}

// Google Provider (si está configurado)
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

// Email Provider (Magic Link) - solo si SMTP está configurado
if (
  process.env.SMTP_HOST &&
  process.env.SMTP_PORT &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASSWORD
) {
  try {
    const smtpConfig = {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    };

    // Configuración según el puerto y proveedor
    const port = Number(process.env.SMTP_PORT);
    
    if (port === 465) {
      // Puerto 465 requiere conexión SSL/TLS segura
      smtpConfig.secure = true;
    } else if (port === 587) {
      // Puerto 587 usa STARTTLS
      smtpConfig.secure = false;
      smtpConfig.requireTLS = true;
    }
    
    // Configuración específica para Gmail
    if (process.env.SMTP_HOST.includes('gmail.com')) {
      smtpConfig.tls = {
        rejectUnauthorized: false,
      };
    }

    // Para Hostinger y la mayoría de servidores SMTP, el remitente (from) debe ser el mismo
    // que el usuario autenticado, o un alias válido. Por seguridad, usamos SMTP_USER como predeterminado.
    // Si SMTP_FROM está configurado y es diferente, solo lo usamos si el usuario lo necesita explícitamente.
    // Para evitar errores, priorizamos SMTP_USER sobre SMTP_FROM.
    const smtpFrom = process.env.SMTP_USER || process.env.SMTP_FROM || 'noreply@example.com';
    
    // Advertencia si SMTP_FROM está configurado pero es diferente a SMTP_USER
    if (process.env.SMTP_FROM && process.env.SMTP_FROM !== process.env.SMTP_USER) {
      console.warn('⚠️  SMTP_FROM es diferente a SMTP_USER. Algunos servidores SMTP (como Hostinger) requieren que el remitente sea el mismo que el usuario autenticado.');
      console.warn(`   SMTP_USER: ${process.env.SMTP_USER}`);
      console.warn(`   SMTP_FROM: ${process.env.SMTP_FROM}`);
      console.warn(`   Usando SMTP_USER como remitente para evitar errores.`);
    }
    
    console.log('📧 Configurando EmailProvider con:', {
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      user: smtpConfig.auth.user,
      from: smtpFrom,
      nextauthUrl: process.env.NEXTAUTH_URL || 'NO CONFIGURADO',
    });

    // NextAuth enviará el email automáticamente usando la configuración SMTP
    // No necesitamos un callback personalizado a menos que queramos personalizar el contenido del email
    providers.push(
      EmailProvider({
        server: smtpConfig,
        from: smtpFrom,
      })
    );
    
    console.log('✅ EmailProvider configurado correctamente');
  } catch (error) {
    console.error('❌ Error al configurar EmailProvider:', error);
    console.error('Detalles del error:', error.message);
    // No agregar el proveedor si hay un error en la configuración
  }
}

// Validar que haya al menos un proveedor configurado
if (providers.length === 0) {
  console.error('⚠️  No hay proveedores de autenticación configurados. Por favor, configura al menos uno en .env.local');
  // No lanzar error aquí, solo loguear
}

// Validar que NEXTAUTH_SECRET esté configurado
if (!process.env.NEXTAUTH_SECRET || process.env.NEXTAUTH_SECRET.trim() === '') {
  console.error('⚠️  NEXTAUTH_SECRET no está configurado. Esto es requerido para NextAuth.');
  // No lanzar error aquí, solo loguear
}

// Validar que NEXTAUTH_URL esté configurado (CRÍTICO para emails)
// NextAuth necesita NEXTAUTH_URL para generar los enlaces de verificación en los emails
if (!process.env.NEXTAUTH_URL) {
  console.error('❌ NEXTAUTH_URL no está configurado. Esto IMPIDE el envío de emails.');
  console.error('   En desarrollo, agrega a .env.local: NEXTAUTH_URL=http://localhost:3000');
  console.error('   En producción, agrega: NEXTAUTH_URL=https://tu-dominio.com');
  console.error('   SIN NEXTAUTH_URL, los emails NO SE ENVIARÁN correctamente.');
} else {
  console.log('✅ NEXTAUTH_URL configurado:', process.env.NEXTAUTH_URL);
  
  // Validar que la URL sea válida
  try {
    const url = new URL(process.env.NEXTAUTH_URL);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      console.error('❌ NEXTAUTH_URL tiene un protocolo inválido:', url.protocol);
    }
  } catch (error) {
    console.error('❌ NEXTAUTH_URL no es una URL válida:', process.env.NEXTAUTH_URL);
  }
}

// Asegurar que siempre haya al menos un proveedor
const finalProviders = providers.length > 0 ? providers : [
  // Proveedor temporal para evitar errores si no hay ninguno configurado
  EmailProvider({
    server: {
      host: 'localhost',
      port: 587,
      auth: {
        user: 'test',
        pass: 'test',
      },
    },
    from: 'noreply@example.com',
  }),
];

console.log(`✅ Configurando NextAuth con ${finalProviders.length} proveedor(es)`);

export const authOptions = {
  adapter: Adapter(),
  providers: finalProviders,
  session: {
    strategy: 'jwt', // Usar JWT para CredentialsProvider (no requiere adapter)
  },
  callbacks: {
    async signIn({ user, account, profile, email, credentials }) {
      if (user?.email && user?.id) {
        try {
          const { acceptInvitation, acceptWorkspaceInvitation } = await import('@/lib/db');
          await acceptInvitation(user.email, user.id);
          await acceptWorkspaceInvitation(user.email, user.id);
        } catch (error) {
          console.error('Error al aceptar invitaciones pendientes:', error);
        }
      }

      // Si el usuario se autentica por email (magic link) y no tiene contraseña,
      // permitir el sign in pero redirigiremos a la página de establecer contraseña
      if (account?.provider === 'email') {
        const adapter = getAdapter();
        const dbUser = await adapter.getUserByEmail(user.email);
        if (dbUser && !dbUser.hasPassword) {
          // El usuario existe pero no tiene contraseña, permitir sign in
          return true;
        }
      }
      return true;
    },
    async redirect({ url, baseUrl }) {
      // Permitir que NextAuth maneje la redirección normalmente
      // La verificación de contraseña se hará en el dashboard
      // Si la URL es relativa, hacerla absoluta
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      // Si la URL es del mismo dominio, permitirla
      if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
    async session({ session, token }) {
      // Agregar el ID del usuario a la sesión
      if (session.user) {
        session.user.id = token.sub || token.id || token.userId || `usr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Agregar el proveedor de autenticación a la sesión
        session.user.provider = token.provider || null;
        
        // Verificar si el usuario tiene contraseña establecida
        if (token.email) {
          try {
            const adapter = getAdapter();
            const dbUser = await adapter.getUserByEmail(token.email);
            session.user.hasPassword = dbUser?.hasPassword || false;
          } catch (error) {
            console.error('Error al verificar contraseña del usuario:', error);
            session.user.hasPassword = false;
          }
        }
      }
      return session;
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id || token.sub || `usr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        token.userId = user.id;
        token.email = user.email;
      }
      // Guardar el proveedor de autenticación en el token
      if (account) {
        // Para OAuth providers (Google, GitHub, Email), account.provider está disponible
        token.provider = account.provider;
      } else if (user && !token.provider) {
        // Para CredentialsProvider, no hay account, pero podemos inferir que es 'credentials'
        // si el usuario tiene contraseña (se autenticó con email/contraseña)
        // Esto se establece solo la primera vez que se crea el token
        try {
          const adapter = getAdapter();
          const dbUser = await adapter.getUserByEmail(user.email);
          if (dbUser?.hasPassword) {
            // Si el usuario tiene contraseña y no hay account, es credentials
            token.provider = 'credentials';
          }
        } catch (error) {
          // Si hay error, no establecer proveedor
          console.error('Error al verificar usuario en jwt:', error);
        }
      }
      return token;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login', // Redirigir errores a la página de login
    verifyRequest: '/verify-email', // Página personalizada de verificación de email
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development', // Habilitar debug en desarrollo
};

// Inicializar NextAuth
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

