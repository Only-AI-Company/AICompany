/**
 * Authentication Module - 认证层
 *
 * 负责：
 * - JWT Token 生成和验证
 * - 设备管理
 * - 会话管理
 */

import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';

export interface AuthConfig {
  secret: string;
  accessTokenExpiresIn: string;
  refreshTokenExpiresIn: string;
}

export interface AuthToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface AuthPayload {
  userId: string;
  deviceId?: string;
}

export interface DeviceInfo {
  id: string;
  userId: string;
  name: string;
  platform: string;
  appVersion: string;
  lastSeen: number;
  isTrusted: boolean;
}

export class AuthService {
  private config: AuthConfig;
  private logger: pino.Logger;
  private devices = new Map<string, DeviceInfo>();
  private refreshTokens = new Map<string, { payload: AuthPayload; expiresAt: number }>();

  constructor(config: AuthConfig) {
    this.config = config;
    this.logger = pino({ name: 'auth-service' });
  }

  /**
   * 生成访问令牌
   */
  generateToken(payload: AuthPayload): AuthToken {
    // 解析过期时间
    const accessTokenExpiresAt = this.parseExpiresIn(this.config.accessTokenExpiresIn);
    const refreshTokenExpiresAt = this.parseExpiresIn(this.config.refreshTokenExpiresIn);

    // 生成 JWT
    const accessToken = jwt.sign(
      {
        userId: payload.userId,
        deviceId: payload.deviceId,
        type: 'access'
      },
      this.config.secret,
      { expiresIn: this.config.accessTokenExpiresIn } as jwt.SignOptions
    );

    const refreshToken = jwt.sign(
      {
        userId: payload.userId,
        deviceId: payload.deviceId,
        type: 'refresh',
        jti: uuidv4()
      },
      this.config.secret,
      { expiresIn: this.config.refreshTokenExpiresIn } as jwt.SignOptions
    );

    // 存储 refresh token
    const refreshPayload = this.verifyToken(refreshToken) as AuthPayload & { jti: string };
    this.refreshTokens.set(refreshPayload.jti, {
      payload: { userId: refreshPayload.userId, deviceId: refreshPayload.deviceId },
      expiresAt: refreshTokenExpiresAt
    });

    return {
      accessToken,
      refreshToken,
      expiresAt: accessTokenExpiresAt
    };
  }

  /**
   * 验证访问令牌
   */
  verifyToken(token: string): AuthPayload | null {
    try {
      const decoded = jwt.verify(token, this.config.secret) as jwt.JwtPayload;
      return {
        userId: decoded.userId,
        deviceId: decoded.deviceId
      };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        this.logger.warn({ error }, 'Token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        this.logger.warn({ error }, 'Invalid token');
      }
      return null;
    }
  }

  /**
   * 刷新访问令牌
   */
  refreshToken(refreshToken: string): AuthToken | null {
    // 验证 refresh token
    const payload = this.verifyToken(refreshToken) as AuthPayload & { jti?: string };
    if (!payload) {
      return null;
    }

    // 检查是否在白名单中
    if (payload.jti) {
      const stored = this.refreshTokens.get(payload.jti);
      if (!stored || stored.expiresAt < Date.now()) {
        this.logger.warn({ jti: payload.jti }, 'Refresh token not found or expired');
        return null;
      }
      // 删除已使用的 refresh token
      this.refreshTokens.delete(payload.jti);
    }

    // 生成新 token
    return this.generateToken({
      userId: payload.userId,
      deviceId: payload.deviceId
    });
  }

  /**
   * 撤销令牌
   */
  revokeToken(token: string): boolean {
    const payload = this.verifyToken(token) as AuthPayload & { jti?: string };
    if (!payload?.jti) {
      return false;
    }

    this.refreshTokens.delete(payload.jti);
    return true;
  }

  /**
   * 撤销用户的所有令牌
   */
  revokeUserTokens(userId: string): number {
    let count = 0;
    for (const [jti, data] of this.refreshTokens.entries()) {
      if (data.payload.userId === userId) {
        this.refreshTokens.delete(jti);
        count++;
      }
    }
    return count;
  }

  /**
   * 注册设备
   */
  registerDevice(userId: string, info: Omit<DeviceInfo, 'id' | 'lastSeen'>): string {
    const deviceId = uuidv4();
    const device: DeviceInfo = {
      ...info,
      id: deviceId,
      userId,
      lastSeen: Date.now()
    };

    this.devices.set(deviceId, device);
    this.logger.info({ deviceId, userId }, 'Device registered');

    return deviceId;
  }

  /**
   * 获取设备信息
   */
  getDevice(deviceId: string): DeviceInfo | undefined {
    return this.devices.get(deviceId);
  }

  /**
   * 更新设备最后活动时间
   */
  updateDeviceLastSeen(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.lastSeen = Date.now();
    }
  }

  /**
   * 设置设备信任状态
   */
  setDeviceTrusted(deviceId: string, trusted: boolean): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.isTrusted = trusted;
      this.logger.info({ deviceId, trusted }, 'Device trust updated');
    }
  }

  /**
   * 获取用户的所有设备
   */
  getUserDevices(userId: string): DeviceInfo[] {
    return Array.from(this.devices.values()).filter(d => d.userId === userId);
  }

  /**
   * 移除设备
   */
  removeDevice(deviceId: string): boolean {
    const result = this.devices.delete(deviceId);
    if (result) {
      this.logger.info({ deviceId }, 'Device removed');
    }
    return result;
  }

  /**
   * 清理过期令牌
   */
  cleanupExpiredTokens(): number {
    const now = Date.now();
    let count = 0;

    for (const [jti, data] of this.refreshTokens.entries()) {
      if (data.expiresAt < now) {
        this.refreshTokens.delete(jti);
        count++;
      }
    }

    if (count > 0) {
      this.logger.info({ count }, 'Cleaned up expired tokens');
    }

    return count;
  }

  private parseExpiresIn(expiresIn: string): number {
    // 简单解析，如 "1h" -> 3600000
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 3600000; // 默认 1 小时
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: return 3600000;
    }
  }
}

// ============================================================================
// 认证中间件
// ============================================================================

/**
 * Express 认证中间件
 */
export function authMiddleware(authService: AuthService) {
  return (req: any, res: any, next: any) => {
    // 获取 Token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid authorization header'
        }
      });
    }

    const token = authHeader.substring(7);
    const payload = authService.verifyToken(token);

    if (!payload) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired token'
        }
      });
    }

    // 附加用户信息到请求
    req.userId = payload.userId;
    req.deviceId = payload.deviceId;

    next();
  };
}

/**
 * 可选认证中间件（有 token 则验证，没有也放行）
 */
export function optionalAuthMiddleware(authService: AuthService) {
  return (req: any, _res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = authService.verifyToken(token);
      if (payload) {
        req.userId = payload.userId;
        req.deviceId = payload.deviceId;
      }
    }
    next();
  };
}
