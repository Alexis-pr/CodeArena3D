import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlayerHudData } from '../../core/models/player.model';

@Component({
  selector: 'app-hud-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './hud-card.component.html',
  styleUrls: ['./hud-card.component.css']
})
export class HudCardComponent {
  /**
   * Datos del jugador inyectados desde el contenedor padre (GameRoomComponent o RoomStateService)
   */
  @Input({ required: true }) player!: PlayerHudData;
}
