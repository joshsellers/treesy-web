# Treesy

A program for drawing syntax trees.  
  
Ported from the [original C++ version](https://github.com/joshsellers/treesy).

### Usage

#### Basic controls:

Click and drag to look around.  
Use the mouse wheel to zoom in/out.

Click on a node using the editor tool to edit its text.  
  
Click on a node using the subscript tool to add a subscript.  
  
#### Adding/removing children:

While in editing mode, hover over the mouse over a node, and three buttons will appear. 
The two plus buttons will add a child node connected to the current node. The plus button on the right will add a child to the right of all the other children, and the one on the left will add a child to the left of all the other children. 

Click the minus button to delete a node and all of its children.  
  
#### Movement:

Click on a node while using the movement tool to draw a movement line. Click on a different node to connect the two with the arrow.  

When drawing a movement line, you can hold left ctrl and use the mouse wheel to change the height of the line, and you can hold left alt and use the mouse wheel to change the angle of the line.  

If you click into the background while drawing a movement line, the movement line will be cancelled.  
  
Click on a node that has movement while using the movement tool to remove a movement line.
