import { Injectable, Logger } from '@nestjs/common';
import { loadConfig, getSanitizedConfig, type EnvConfig } from '@cyris/config';

@Injectable()
export class ConfigService {
  private readonly logger = new Logger(ConfigService.name);
  private readonly config: EnvConfig;

  constructor() {
    this.config = loadConfig();
    this.logger.log('CYRIS environment configuration loaded and validated successfully.');
  }

  get values(): EnvConfig {
    return this.config;
  }

  get sanitized(): Record<string, unknown> {
    return getSanitizedConfig(this.config);
  }

  get port(): number {
    return this.config.PORT;
  }

  get nodeEnv(): string {
    return this.config.NODE_ENV;
  }

  get isProduction(): boolean {
    return this.config.NODE_ENV === 'production';
  }
}
