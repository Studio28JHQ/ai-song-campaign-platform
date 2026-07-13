/**
 * Minimal dependency injection container. Deliberately hand-rolled instead
 * of pulling in a DI framework — this project needs "register a factory,
 * resolve a singleton by token," nothing more.
 *
 * No providers are registered here yet; registration happens where a
 * concrete service/repository is introduced.
 */

export type Token<T> = symbol & { readonly __type?: T };

export function createToken<T>(description: string): Token<T> {
  return Symbol(description) as Token<T>;
}

type Factory<T> = () => T;

export class Container {
  private readonly factories = new Map<symbol, Factory<unknown>>();
  private readonly singletons = new Map<symbol, unknown>();

  register<T>(token: Token<T>, factory: Factory<T>): void {
    this.factories.set(token, factory as Factory<unknown>);
  }

  resolve<T>(token: Token<T>): T {
    if (this.singletons.has(token)) {
      return this.singletons.get(token) as T;
    }

    const factory = this.factories.get(token);
    if (!factory) {
      throw new Error(`No provider registered for token: ${String(token)}`);
    }

    const instance = factory() as T;
    this.singletons.set(token, instance);
    return instance;
  }

  has(token: Token<unknown>): boolean {
    return this.factories.has(token);
  }
}

export const container = new Container();
