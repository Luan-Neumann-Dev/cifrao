import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  UpdateNotificationPrefsInput,
  UpdateProfileInput,
} from '@cifrao/shared';
import { PrismaService } from '../prisma/prisma.service';

/** Campos de perfil e preferência que a tela lê e escreve. Nunca credencial. */
const PROFILE_SELECT = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  twoFactorEnabled: true,
  createdAt: true,
  theme: true,
  accentColor: true,
  notifyInvoiceDue: true,
  notifyBudgetExceeded: true,
  notifyGoalReached: true,
  notifyForecastDue: true,
  notifyDaysBefore: true,
} as const;

/**
 * Configurações do dono (Fase 9): perfil, aparência, sessões ativas e
 * preferências de aviso.
 *
 * A sessão é do Better Auth, que grava na tabela `Session`. A API só lê e revoga
 * — quem emite continua sendo o Next, para não haver duas fontes de verdade.
 */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async profile(userId: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: PROFILE_SELECT,
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  async updateProfile(userId: string, input: UpdateProfileInput) {
    await this.ensureExists(userId);
    return this.prisma.client.user.update({
      where: { id: userId },
      data: input,
      select: PROFILE_SELECT,
    });
  }

  async updateNotifications(userId: string, input: UpdateNotificationPrefsInput) {
    await this.ensureExists(userId);
    return this.prisma.client.user.update({
      where: { id: userId },
      data: input,
      select: PROFILE_SELECT,
    });
  }

  /**
   * Sessões ativas. A expirada não aparece: ela já não abre nada, e listar lixo
   * só atrapalha quem está procurando um acesso estranho.
   */
  async sessions(userId: string, currentToken?: string | null) {
    const rows = await this.prisma.client.session.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        token: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
        ipAddress: true,
        userAgent: true,
      },
    });

    return rows.map(({ token, ...session }) => ({
      ...session,
      device: describeUserAgent(session.userAgent),
      current: Boolean(currentToken) && token === currentToken,
    }));
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = await this.prisma.client.session.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) {
      throw new NotFoundException('Sessão não encontrada');
    }
    await this.prisma.client.session.delete({ where: { id: sessionId } });
    return { ok: true };
  }

  /** Encerra tudo menos a sessão atual — o botão "saí num computador público". */
  async revokeOtherSessions(userId: string, currentToken?: string | null) {
    if (!currentToken) {
      throw new ForbiddenException('Sem sessão atual identificada; faça login de novo.');
    }
    const result = await this.prisma.client.session.deleteMany({
      where: { userId, token: { not: currentToken } },
    });
    return { revoked: result.count };
  }

  private async ensureExists(userId: string) {
    const found = await this.prisma.client.user.findUnique({ where: { id: userId } });
    if (!found) throw new NotFoundException('Usuário não encontrado');
  }
}

/**
 * Rótulo legível do dispositivo. É heurística de user-agent mesmo: serve para
 * reconhecer "esse aqui é meu celular", não para identificação forense.
 */
export function describeUserAgent(userAgent?: string | null): string {
  if (!userAgent) return 'Dispositivo desconhecido';
  const ua = userAgent.toLowerCase();

  const os = ua.includes('android')
    ? 'Android'
    : ua.includes('iphone') || ua.includes('ipad')
      ? 'iOS'
      : ua.includes('windows')
        ? 'Windows'
        : ua.includes('mac os') || ua.includes('macintosh')
          ? 'macOS'
          : ua.includes('linux')
            ? 'Linux'
            : 'Sistema desconhecido';

  // Ordem importa: Edge e Opera também dizem "chrome"; Chrome também diz "safari".
  const browser = ua.includes('edg/')
    ? 'Edge'
    : ua.includes('opr/') || ua.includes('opera')
      ? 'Opera'
      : ua.includes('firefox')
        ? 'Firefox'
        : ua.includes('chrome')
          ? 'Chrome'
          : ua.includes('safari')
            ? 'Safari'
            : 'Navegador desconhecido';

  return `${browser} · ${os}`;
}
