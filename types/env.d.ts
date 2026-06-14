declare namespace NodeJS {
  interface ProcessEnv {
    BACKEND_INTERNAL_URL?: string;
    DOCKER?: string;
    NODE_ENV?: 'development' | 'production' | 'test';
  }
}
