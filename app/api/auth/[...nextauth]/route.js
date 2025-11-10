import NextAuth from 'next-auth';
import GitHubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import EmailProvider from 'next-auth/providers/email';
import CredentialsProvider from 'next-auth/providers/credentials';
import Adapter from '@/lib/adapter';

console.log('🔧 Inicializando NextAuth...');

// Construir array de proveedores dinámicamente
const providers = [];

// Credentials Provider (usuario/contraseña simple)
providers.push(
  CredentialsProvider({
    name: 'Credenciales',
    credentials: {
      username: { label: 'Usuario', type: 'text' },
      password: { label: 'Contraseña', type: 'password' }
    },
    async authorize(credentials) {
      // Usuario y contraseña simple para desarrollo
      if (credentials?.username === 'admin' && credentials?.password === 'admin') {
        return {
          id: 'admin',
          name: 'Administrador',
          email: 'admin@flowhook.com',
        };
      }
      return null;
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

    console.log('📧 Configurando EmailProvider con:', {
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      user: smtpConfig.auth.user,
    });

    providers.push(
      EmailProvider({
        server: smtpConfig,
        from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@example.com',
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
    async session({ session, token }) {
      // Agregar el ID del usuario a la sesión
      if (session.user) {
        session.user.id = token.sub || token.id || token.userId || `usr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id || token.sub || `usr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        token.userId = user.id;
      }
      return token;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login', // Redirigir errores a la página de login
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development', // Habilitar debug en desarrollo
};

// Inicializar NextAuth
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

