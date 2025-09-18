declare module "pg" {
  export interface QueryResult<T = any> {
    rows: T[];
  }

  export interface PoolConfig {
    connectionString?: string;
    ssl?: any;
    [key: string]: unknown;
  }

  export class Pool {
    constructor(config?: PoolConfig);
    query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
    end(): Promise<void>;
  }
}
