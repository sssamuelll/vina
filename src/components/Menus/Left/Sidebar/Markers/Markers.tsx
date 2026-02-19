import React from 'react';
import './Markers.css';
import { MarkerSVG } from '../../../../../assets/svgs/SVGSLibrary';

interface MarkersProps {
    markers: Marker[];
}

interface Marker {
    name: string;
}

const Markers: React.FC<MarkersProps> = ({markers}) => {
    
    return (
        <div className="markersContainer">
            <div className="markersTitle">
                Marcadores
            </div>
            <div className="markersList">
                {markers.map((marker, index) => (
                    <div key={index} className="marker">
                        <div className="markerIcon">
                            <MarkerSVG />
                        </div>
                        <div className="markerName">{marker.name}</div>
                    </div>
                ))}
            </div>
        </div>
    )
}

export default Markers;