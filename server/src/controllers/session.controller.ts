import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthDto } from 'src/dtos/auth.dto';
import { SessionCreateDto, SessionCreateResponseDto, SessionResponseDto, SessionUpdateDto } from 'src/dtos/session.dto';
import { Permission } from 'src/enum';
import { Auth, Authenticated } from 'src/middleware/auth.guard';
import { SessionService } from 'src/services/session.service';
import { UUIDParamDto } from 'src/validation';

@ApiTags('Sessions')
@Controller('sessions')
export class SessionController {
  constructor(private service: SessionService) {}

  @Post()
  @Authenticated({ permission: Permission.SessionCreate })
  createSession(@Auth() auth: AuthDto, @Body() dto: SessionCreateDto): Promise<SessionCreateResponseDto> {
    return this.service.create(auth, dto);
  }

  @Get()
  @Authenticated({ permission: Permission.SessionRead })
  getSessions(@Auth() auth: AuthDto): Promise<SessionResponseDto[]> {
    return this.service.getAll(auth);
  }

  @Delete()
  @Authenticated({ permission: Permission.SessionDelete })
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteAllSessions(@Auth() auth: AuthDto): Promise<void> {
    return this.service.deleteAll(auth);
  }

  @Put(':id')
  @Authenticated({ permission: Permission.SessionUpdate })
  updateSession(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: SessionUpdateDto,
  ): Promise<SessionResponseDto> {
    return this.service.update(auth, id, dto);
  }

  @Delete(':id')
  @Authenticated({ permission: Permission.SessionDelete })
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteSession(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto): Promise<void> {
    return this.service.delete(auth, id);
  }

  @Post(':id/lock')
  @Authenticated({ permission: Permission.SessionLock })
  @HttpCode(HttpStatus.NO_CONTENT)
  lockSession(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto): Promise<void> {
    return this.service.lock(auth, id);
  }
}
