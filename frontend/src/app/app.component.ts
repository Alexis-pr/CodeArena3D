import { Component } from '@angular/core';
import { GameRoomComponent } from './features/game-room/game-room.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [GameRoomComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'CodeArena 3D';
}

export { AppComponent as App };
