// TiDB Serverless connection helper
// TiDB Serverless provides free MySQL-compatible distributed cloud database

export interface TiDBConfig {
  host: string;
  port: number;
  user: string;
  password?: string;
  database: string;
  ssl: { minVersion: string; rejectUnauthorized: boolean };
}

export function getTiDBConfig(): TiDBConfig {
  return {
    host: process.env.TIDB_HOST || 'gateway01.eu-central-1.prod.aws.tidbcloud.com',
    port: parseInt(process.env.TIDB_PORT || '4000', 10),
    user: process.env.TIDB_USER || 'root',
    password: process.env.TIDB_PASSWORD || '',
    database: process.env.TIDB_DATABASE || 'star_vault',
    ssl: {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true
    }
  };
}
