import React from 'react';
import Header from './Header/Header';
import LabelsFilterBar from './LabelsFilterBar/LabelsFilterBar';
import Markers from './Markers/Markers';

interface LeftProps {
    setSidebarsMinimized: (sidebarsMinimized: boolean) => void;
}

const Left: React.FC<LeftProps> = ({ setSidebarsMinimized }) => {
    const markers = [
        { name: 'Marker 1' },
        { name: 'Marker 2' },
        { name: 'Marker 3' },
    ];
    
    return (
        <>
            <aside className="sidebar left-sidebar">
                <Header setSidebarsMinimized={setSidebarsMinimized} />
                <LabelsFilterBar />
                <Markers markers={markers} />
            </aside>
        </>
    )

}

export default Left;