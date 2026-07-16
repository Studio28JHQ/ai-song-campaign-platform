import type { AdminUserRepository } from "@/domain/admin/repositories/AdminUserRepository";
import type { ListAdminUsersResponse } from "../dto/AdminUserDto";

/** Lists every operator account for the Administradores screen — oldest first (see `PrismaAdminUserRepository.findAll`). */
export class ListAdminUsersUseCase {
  constructor(private readonly adminUserRepository: AdminUserRepository) {}

  async execute(): Promise<ListAdminUsersResponse> {
    const admins = await this.adminUserRepository.findAll();
    return { items: admins.map((admin) => admin.toSnapshot()) };
  }
}
