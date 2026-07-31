import { Controller, Post, Get, Body, Request, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { Public } from './decorators/public.decorator';
interface ApiResponse<T> { success: boolean; data: T; message?: string }

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('signup')
  async signup(@Body() dto: SignupDto): Promise<ApiResponse<any>> {
    const result = await this.authService.signup(dto);
    return { success: true, data: result };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<ApiResponse<any>> {
    const result = await this.authService.login(dto);
    return { success: true, data: result };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: { refreshToken: string }) {
    const tokens = await this.authService.refreshToken(body.refreshToken);
    return { success: true, data: tokens };
  }

  @Get('me')
  async getProfile(@Request() req: any) {
    const profile = await this.authService.getProfile(req.user.id);
    return { success: true, data: profile };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout() {
    return { success: true, data: { message: 'Logged out' } };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(@Request() req: any, @Body() body: { currentPassword: string; newPassword: string }) {
    if (!body.currentPassword || !body.newPassword) throw new BadRequestException('currentPassword and newPassword are required');
    const result = await this.authService.changePassword(req.user.id, body);
    return { success: true, data: result };
  }
}
