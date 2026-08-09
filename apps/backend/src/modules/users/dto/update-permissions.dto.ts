import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsBoolean, IsIn, ValidateNested } from 'class-validator';
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from '../../auth/permissions.constants';

/**
 * One cell-row of the Permissions Matrix: a module/action pair plus the flag
 * for each role. The Matrix UI PUTs the whole matrix back, so a request is
 * normally 110 of these.
 *
 * `module` and `action` are constrained to the known vocabulary
 * (auth/permissions.constants.ts) — before this DTO the handler took
 * `any[]` and upserted whatever arrived, so a typo'd or invented module name
 * silently created junk rows that nothing would ever read.
 */
export class RolePermissionDto {
  @IsIn(PERMISSION_MODULES as unknown as string[], {
    message: `module must be one of: ${PERMISSION_MODULES.join(', ')}`,
  })
  module!: string;

  @IsIn(PERMISSION_ACTIONS as unknown as string[], {
    message: `action must be one of: ${PERMISSION_ACTIONS.join(', ')}`,
  })
  action!: string;

  // Persisted, but the guard ignores it: admins always bypass the matrix.
  @IsBoolean()
  admin!: boolean;

  @IsBoolean()
  manager!: boolean;

  @IsBoolean()
  worker!: boolean;
}

export class UpdatePermissionsDto {
  @IsArray()
  @ArrayNotEmpty()
  // 22 modules x 5 actions = 110 rows today; the cap only stops an absurd payload.
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => RolePermissionDto)
  permissions!: RolePermissionDto[];
}
