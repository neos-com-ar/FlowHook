import { createClient } from '@vercel/kv';
import fs from 'fs';
import path from 'path';

// Verificar si Vercel KV está disponible y tiene credenciales válidas
const useKV = process.env.KV_REST_API_URL && 
              process.env.KV_REST_API_TOKEN &&
              !process.env.KV_REST_API_URL.includes('tu-kv-instance') &&
              !process.env.KV_REST_API_TOKEN.includes('tu-kv-token');

// Crear cliente KV si está disponible
let kv = null;
if (useKV) {
  try {
    kv = createClient({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
    console.log('✅ Usando Vercel KV como adapter para NextAuth');
  } catch (error) {
    console.error('Error creating KV client:', error);
    kv = null;
  }
} else {
  console.log('📁 Usando sistema de archivos local como adapter para NextAuth');
}

// Función para obtener datos del fallback local
function getLocalData() {
  const dataPath = path.join(process.cwd(), 'tmp', 'auth.json');
  try {
    if (fs.existsSync(dataPath)) {
      const data = fs.readFileSync(dataPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading local auth data:', error);
  }
  return {};
}

// Función para guardar datos en el fallback local
function saveLocalData(data) {
  const dataPath = path.join(process.cwd(), 'tmp', 'auth.json');
  const dataDir = path.dirname(dataPath);
  
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving local auth data:', error);
    throw error;
  }
}

// Adapter simple para NextAuth
export default function Adapter() {
  const adapter = {
    async createUser(user) {
      const userId = user.id || `usr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const userData = { ...user, id: userId };
      
      if (useKV && kv) {
        const key = `user:${userData.email}`;
        await kv.set(key, userData);
        const idKey = `user_id:${userId}`;
        await kv.set(idKey, userData.email);
        return userData;
      } else {
        const data = getLocalData();
        if (!data.users) data.users = {};
        data.users[userData.email] = userData;
        if (!data.userIds) data.userIds = {};
        data.userIds[userId] = userData.email;
        saveLocalData(data);
        return userData;
      }
    },
    async getUser(id) {
      if (useKV && kv) {
        const idKey = `user_id:${id}`;
        const email = await kv.get(idKey);
        if (!email) return null;
        const key = `user:${email}`;
        return await kv.get(key);
      } else {
        const data = getLocalData();
        const email = data.userIds?.[id];
        if (!email) return null;
        return data.users?.[email] || null;
      }
    },
    async getUserByEmail(email) {
      if (useKV && kv) {
        const key = `user:${email}`;
        return await kv.get(key);
      } else {
        const data = getLocalData();
        return data.users?.[email] || null;
      }
    },
    async getUserByAccount({ providerAccountId, provider }) {
      if (useKV && kv) {
        const key = `account:${provider}:${providerAccountId}`;
        const account = await kv.get(key);
        if (account) {
          return await adapter.getUser(account.userId);
        }
        return null;
      } else {
        const data = getLocalData();
        const account = data.accounts?.find(
          acc => acc.provider === provider && acc.providerAccountId === providerAccountId
        );
        if (account) {
          const email = data.userIds?.[account.userId];
          return email ? data.users?.[email] || null : null;
        }
        return null;
      }
    },
    async updateUser(user) {
      if (useKV && kv) {
        const key = `user:${user.email}`;
        await kv.set(key, user);
        return user;
      } else {
        const data = getLocalData();
        if (!data.users) data.users = {};
        data.users[user.email] = { ...data.users[user.email], ...user };
        saveLocalData(data);
        return data.users[user.email];
      }
    },
    async linkAccount(account) {
      if (useKV && kv) {
        const key = `account:${account.provider}:${account.providerAccountId}`;
        await kv.set(key, account);
      } else {
        const data = getLocalData();
        if (!data.accounts) data.accounts = [];
        data.accounts.push(account);
        saveLocalData(data);
      }
      return account;
    },
    async createSession(session) {
      if (useKV && kv) {
        try {
          const key = `session:${session.sessionToken}`;
          await kv.set(key, session);
          return session;
        } catch (error) {
          console.error('Error al crear sesión en KV, usando fallback local:', error);
          // Fallback a local si KV falla
          const data = getLocalData();
          if (!data.sessions) data.sessions = {};
          data.sessions[session.sessionToken] = session;
          saveLocalData(data);
          return session;
        }
      } else {
        const data = getLocalData();
        if (!data.sessions) data.sessions = {};
        data.sessions[session.sessionToken] = session;
        saveLocalData(data);
        return session;
      }
    },
    async getSessionAndUser(sessionToken) {
      if (useKV && kv) {
        try {
          const key = `session:${sessionToken}`;
          const session = await kv.get(key);
          if (!session) return null;
          const user = await adapter.getUser(session.userId);
          return { session, user };
        } catch (error) {
          console.error('Error al obtener sesión de KV, usando fallback local:', error);
          // Fallback a local si KV falla
          const data = getLocalData();
          const session = data.sessions?.[sessionToken];
          if (!session) return null;
          const email = data.userIds?.[session.userId];
          const user = email ? data.users?.[email] : null;
          return { session, user };
        }
      } else {
        const data = getLocalData();
        const session = data.sessions?.[sessionToken];
        if (!session) return null;
        const email = data.userIds?.[session.userId];
        const user = email ? data.users?.[email] : null;
        return { session, user };
      }
    },
    async updateSession(session) {
      if (useKV && kv) {
        const key = `session:${session.sessionToken}`;
        await kv.set(key, session);
        return session;
      } else {
        const data = getLocalData();
        if (!data.sessions) data.sessions = {};
        data.sessions[session.sessionToken] = session;
        saveLocalData(data);
        return session;
      }
    },
    async deleteSession(sessionToken) {
      if (useKV && kv) {
        const key = `session:${sessionToken}`;
        await kv.del(key);
      } else {
        const data = getLocalData();
        if (data.sessions) {
          delete data.sessions[sessionToken];
          saveLocalData(data);
        }
      }
    },
    async createVerificationToken(verificationToken) {
      if (useKV && kv) {
        const key = `verification:${verificationToken.identifier}:${verificationToken.token}`;
        await kv.set(key, verificationToken, { ex: 86400 }); // Expira en 24 horas
        return verificationToken;
      } else {
        const data = getLocalData();
        if (!data.verificationTokens) data.verificationTokens = {};
        const tokenKey = `${verificationToken.identifier}:${verificationToken.token}`;
        data.verificationTokens[tokenKey] = verificationToken;
        saveLocalData(data);
        return verificationToken;
      }
    },
    async useVerificationToken({ identifier, token }) {
      if (useKV && kv) {
        const key = `verification:${identifier}:${token}`;
        const verificationToken = await kv.get(key);
        if (verificationToken) {
          await kv.del(key);
        }
        return verificationToken;
      } else {
        const data = getLocalData();
        const tokenKey = `${identifier}:${token}`;
        const verificationToken = data.verificationTokens?.[tokenKey];
        if (verificationToken) {
          delete data.verificationTokens[tokenKey];
          saveLocalData(data);
        }
        return verificationToken || null;
      }
    },
  };
  
  return adapter;
}

